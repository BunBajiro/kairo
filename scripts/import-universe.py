"""Build Kairo's offline universe from CCP's official JSON Lines SDE.

Usage: python scripts/import-universe.py /path/to/eve-online-static-data-BUILD-jsonl.zip
An extracted JSONL directory is also accepted. No third-party Python packages needed.
The archive's _sde record identifies its build and release date. This developer
tool regenerates the bundled topology, detail shards and provenance. The standalone
runtime uses its separate managed SDE updater; see docs/DATASETS.md.
"""
import argparse
import collections
import gzip
import hashlib
import json
import math
from pathlib import Path
import zipfile

# EVE uses this rounded constant, not the astronomical light-year definition.
LIGHT_YEAR = 9460000000000000
DETAIL_CHUNK_BYTES = 8 * 1024 * 1024
ROOT = Path(__file__).resolve().parents[1]


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()


def compressed(value):
    result = bytearray(gzip.compress(encoded(value), compresslevel=9, mtime=0))
    # Python versions before 3.13 can expose the host OS in gzip.compress headers.
    # Use the portable 'unknown OS' byte, with no filename or timestamp metadata.
    result[9] = 255
    return bytes(result)


def split_details(source_path, output_path):
    """Shard the logical archive without recompressing members or changing offsets."""
    files = []
    with source_path.open("rb") as source:
        while chunk := source.read(DETAIL_CHUNK_BYTES):
            name = f"universe-details-{len(files):03d}.bin"
            (output_path / (name + ".tmp")).write_bytes(chunk)
            files.append({"name": name, "bytes": len(chunk), "sha256": hashlib.sha256(chunk).hexdigest()})
    return files


def english(value, fallback=""):
    return value.get("en", fallback) if isinstance(value, dict) else value or fallback


def roman(number):
    result = ""
    for value, numeral in [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"),
                           (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"),
                           (5, "V"), (4, "IV"), (1, "I")]:
        count, number = divmod(number, value)
        result += numeral * count
    return result


def position(record):
    p = record.get("position", {"x": 0, "y": 0, "z": 0})
    if any(not isinstance(p.get(k), (float, int)) or not math.isfinite(p[k]) for k in ("x", "y", "z")):
        raise ValueError(f"Invalid position for {record.get('_key')}")
    return {k: p[k] for k in ("x", "y", "z")}


def projected(record):
    p = position(record)
    return {**p, "map_x": p["x"] / LIGHT_YEAR, "map_y": -p["z"] / LIGHT_YEAR}


def space(region_id):
    if 11000000 <= region_id < 12000000:
        return "wormhole"
    if 12000000 <= region_id < 13000000:
        return "abyssal"
    if 10000000 <= region_id < 11000000:
        return "known"
    return "other"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "server/data")
    args = parser.parse_args()
    archive = zipfile.ZipFile(args.source) if args.source.is_file() else None
    files = set(archive.namelist()) if archive else {p.name for p in args.source.iterdir()}
    consumed = {}

    def rows(filename):
        if filename not in files:
            raise ValueError(f"Required official SDE file is missing: {filename}")
        digest = hashlib.sha256()
        with archive.open(filename) if archive else (args.source / filename).open("rb") as source:
            for line in source:
                digest.update(line)
                if line.strip():
                    yield json.loads(line)
        consumed[filename] = digest.hexdigest()

    sde_records = list(rows("_sde.jsonl"))
    sde = next(r for r in sde_records if r["_key"] == "sde")
    regions = {r["_key"]: r for r in rows("mapRegions.jsonl")}
    constellations = {r["_key"]: r for r in rows("mapConstellations.jsonl")}
    raw_systems = {r["_key"]: r for r in rows("mapSolarSystems.jsonl")}
    raw_gates = {r["_key"]: r for r in rows("mapStargates.jsonl")}
    type_names = {}
    descriptions = {}
    for r in rows("types.jsonl"):
        type_names[r["_key"]] = english(r.get("name"))
        if 30000 <= r["_key"] < 32000:
            descriptions[r["_key"]] = english(r.get("description"))
    owners = {r["_key"]: english(r.get("name")) for r in rows("npcCorporations.jsonl")}
    operations = {r["_key"]: r for r in rows("stationOperations.jsonl")}
    details = {sid: {"system_id": sid, "star": None, "celestials": [], "stations": [], "stargates": []}
               for sid in raw_systems}
    systems = {}
    for sid, r in sorted(raw_systems.items()):
        region = regions[r["regionID"]]
        constellation = constellations[r["constellationID"]]
        if constellation["regionID"] != region["_key"]:
            raise ValueError(f"Inconsistent parent region for system {sid}")
        kind = space(r["regionID"])
        wh_class = r.get("wormholeClassID", constellation.get("wormholeClassID", region.get("wormholeClassID")))
        systems[sid] = {"system_id": sid, "name": english(r["name"]), "region_id": region["_key"],
                        "constellation_id": constellation["_key"], "security": r["securityStatus"],
                        **projected(r), "space": kind, "space_class": wh_class,
                        "wormhole_class": wh_class if kind == "wormhole" else None,
                        "faction_id": r.get("factionID", constellation.get("factionID", region.get("factionID"))),
                        "effect": None, "effect_id": None,
                        # Structural exclusion only; routing also checks security and ship rules.
                        "jump_eligible": kind == "known" and region["_key"] not in
                        {10000004, 10000017, 10000019, 10000070, 10001000, 10001004}}
        if "position2D" in r:
            systems[sid].update(schematic_x=r["position2D"]["x"] / LIGHT_YEAR,
                                schematic_y=-r["position2D"]["y"] / LIGHT_YEAR)

    def body(r, kind):
        sid = r["solarSystemID"]
        if sid not in systems:
            raise ValueError(f"Unknown system {sid} for celestial {r['_key']}")
        return {"id": r["_key"], "kind": kind, "type_id": r["typeID"],
                "type_name": type_names.get(r["typeID"], str(r["typeID"])), "position": position(r),
                "orbit_id": r.get("orbitID"), "radius": r.get("radius"),
                "celestial_index": r.get("celestialIndex"), "orbit_index": r.get("orbitIndex")}

    orbit_names = {}
    for r in rows("mapStars.jsonl"):
        item = body(r, "star")
        item["name"] = systems[r["solarSystemID"]]["name"]
        item["statistics"] = r.get("statistics", {})
        details[r["solarSystemID"]]["star"] = item
        orbit_names[item["id"]] = item["name"]
    for filename, kind in [("mapPlanets.jsonl", "planet"), ("mapMoons.jsonl", "moon"),
                           ("mapAsteroidBelts.jsonl", "asteroid_belt")]:
        for r in rows(filename):
            item = body(r, kind)
            system_name = systems[r["solarSystemID"]]["name"]
            if kind == "planet":
                fallback = f"{system_name} {roman(r['celestialIndex'])}"
            else:
                orbit = orbit_names.get(r.get("orbitID"), system_name)
                fallback = f"{orbit} - {'Moon' if kind == 'moon' else 'Asteroid Belt'} {r['orbitIndex']}"
            item["name"] = english(r.get("uniqueName"), fallback)
            orbit_names[item["id"]] = item["name"]
            details[r["solarSystemID"]]["celestials"].append(item)
    for r in rows("mapSecondarySuns.jsonl"):
        sid, effect_id = r["solarSystemID"], r["effectBeaconTypeID"]
        item = body(r, "secondary_star")
        item.update(name=type_names.get(r["typeID"], "Secondary star"), effect_id=effect_id)
        details[sid]["celestials"].append(item)
        systems[sid].update(effect=type_names.get(effect_id, str(effect_id)), effect_id=effect_id)
        details[sid]["effect_description"] = descriptions.get(effect_id, "")
    for r in rows("npcStations.jsonl"):
        item = body(r, "station")
        owner = owners.get(r["ownerID"], str(r["ownerID"]))
        operation = operations[r["operationID"]]
        suffix = " " + english(operation.get("operationName")) if r.get("useOperationName") else ""
        fallback = f"{orbit_names.get(r.get('orbitID'), systems[r['solarSystemID']]['name'])} - {owner}{suffix}"
        item.update(name=english(r.get("name"), fallback), owner_id=r["ownerID"], owner_name=owner,
                    operation_id=r["operationID"], services=operation.get("services", []))
        details[r["solarSystemID"]]["stations"].append(item)
    edges = set()
    for gid, r in sorted(raw_gates.items()):
        sid, destination = r["solarSystemID"], r["destination"]
        other = raw_gates[destination["stargateID"]]
        if other["destination"]["stargateID"] != gid or other["solarSystemID"] != destination["solarSystemID"]:
            raise ValueError(f"Non-reciprocal gate {gid}; directed gate support required before publishing")
        if destination["solarSystemID"] not in systems:
            raise ValueError(f"Gate {gid} points to unknown system")
        if gid not in raw_systems[sid].get("stargateIDs", []):
            raise ValueError(f"Gate {gid} missing from source system")
        item = body(r, "stargate")
        item.update(name=f"Stargate ({systems[destination['solarSystemID']]['name']})",
                    destination_system_id=destination["solarSystemID"], destination_stargate_id=destination["stargateID"])
        details[sid]["stargates"].append(item)
        edges.add(tuple(sorted([sid, destination["solarSystemID"]])))

    args.output.mkdir(parents=True, exist_ok=True)
    detail_index = {}
    detail_digest = hashlib.sha256()
    detail_tmp = args.output / "universe-details.bin.tmp"
    with detail_tmp.open("wb") as output:
        for sid, detail in sorted(details.items()):
            for key in ["celestials", "stations", "stargates"]:
                detail[key].sort(key=lambda r: (r.get("celestial_index") or 0, r.get("orbit_index") or 0, r["id"]))
            counts = collections.Counter(r["kind"] for r in detail["celestials"])
            systems[sid].update(planet_count=counts["planet"], moon_count=counts["moon"],
                                belt_count=counts["asteroid_belt"], station_count=len(detail["stations"]),
                                gate_count=len(detail["stargates"]))
            chunk = compressed(detail)
            detail_index[sid] = [output.tell(), len(chunk)]
            output.write(chunk)
            detail_digest.update(chunk)
    detail_files = split_details(detail_tmp, args.output)
    source_url = f"https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-{sde['buildNumber']}-jsonl.zip"
    counts = {"systems": len(systems), "regions": len(regions), "constellations": len(constellations),
              "gates": len(edges), "stargates": len(raw_gates),
              "celestials": sum(len(d["celestials"]) for d in details.values()),
              "stations": sum(len(d["stations"]) for d in details.values()),
              "space": dict(collections.Counter(s["space"] for s in systems.values()))}
    metadata = {"schema": 1, "build": sde["buildNumber"], "releasedAt": sde["releaseDate"],
                "source": source_url, "provider": "CCP Games Static Data Export", "counts": counts,
                "projection": {"plane": "XZ", "x": "x / lightYearMetres", "y": "-z / lightYearMetres",
                               "lightYearMetres": LIGHT_YEAR, "physicalPositionsUnit": "metres"},
                "detailsSha256": detail_digest.hexdigest(), "detailsBytes": detail_tmp.stat().st_size,
                "sourceFileSha256": dict(sorted(consumed.items())),
                "notes": ["Celestial positions are system-local metres; system positions are universe metres.",
                          "Static coordinates do not establish wormhole connections or cynosural access.",
                          "Generated celestial names use official unique names where present, otherwise system/orbit indices.",
                          "Ship, skill, security and cynosural restrictions must be applied separately to jump planning."]}
    if archive:
        digest = hashlib.sha256()
        with args.source.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
        metadata["sourceArchiveSha256"] = digest.hexdigest()
    metadata["detailsChunkBytes"] = DETAIL_CHUNK_BYTES
    metadata["detailsFiles"] = detail_files
    snapshot = {"metadata": metadata, "systems": list(systems.values()),
                "regions": [{"region_id": rid, "name": english(r["name"]), "faction_id": r.get("factionID"),
                             "space": space(rid), **projected(r)} for rid, r in sorted(regions.items())],
                "constellations": [{"constellation_id": cid, "name": english(r["name"]), "region_id": r["regionID"],
                                    **projected(r)} for cid, r in sorted(constellations.items())],
                "gates": [{"from_system_id": a, "to_system_id": b} for a, b in sorted(edges)],
                "detailIndex": detail_index}
    topology_tmp = args.output / "universe.json.gz.tmp"
    topology_tmp.write_bytes(compressed(snapshot))
    for part in detail_files:
        (args.output / (part["name"] + ".tmp")).replace(args.output / part["name"])
    topology_tmp.replace(args.output / "universe.json.gz")
    (args.output / "universe-provenance.json").write_bytes(encoded(metadata) + b"\n")
    detail_tmp.unlink()
    (args.output / "universe-details.bin").unlink(missing_ok=True)
    current_files = {part["name"] for part in detail_files}
    for old in args.output.glob("universe-details-*.bin"):
        if old.name not in current_files:
            old.unlink()
    print(json.dumps({**counts, "build": sde["buildNumber"], "topologyBytes": (args.output / "universe.json.gz").stat().st_size,
                      "detailBytes": metadata["detailsBytes"]}))


if __name__ == "__main__":
    main()
