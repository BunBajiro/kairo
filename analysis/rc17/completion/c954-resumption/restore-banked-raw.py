#!/usr/bin/env python3
"""Verify or restore the lossless evidence backups listed beside this script."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def inside(root, relative):
    path = Path(relative)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"Unsafe manifest path: {relative}")
    target = (root / path).resolve()
    target.relative_to(root.resolve())
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--verify", action="store_true", help="Verify every archive without writing originals")
    action.add_argument("--restore", action="store_true", help="Restore originals, refusing to overwrite different bytes")
    parser.add_argument("--destination", type=Path, help="Repository-shaped destination; defaults to this repository")
    args = parser.parse_args()
    if args.destination and not args.restore:
        parser.error("--destination requires --restore")
    here = Path(__file__).resolve().parent
    repository = here.parents[3]
    manifest_path = here / "banked-raw-manifest.json"
    manifest_bytes = manifest_path.read_bytes()
    expected_manifest_hash = (here / "banked-raw-manifest.sha256").read_text().split()[0]
    if sha256(manifest_bytes) != expected_manifest_hash:
        raise ValueError("Manifest SHA-256 mismatch")
    manifest = json.loads(manifest_bytes)
    if manifest["schemaVersion"] != 1:
        raise ValueError("Unsupported manifest version")
    destination = (args.destination or repository).resolve()

    def unpack(row):
        compressed = inside(repository, row["gzipPath"]).read_bytes()
        if len(compressed) != row["gzipBytes"] or sha256(compressed) != row["gzipSha256"]:
            raise ValueError(f"Compressed checksum mismatch: {row['gzipPath']}")
        with gzip.GzipFile(fileobj=io.BytesIO(compressed)) as archive:
            raw = archive.read(row["rawBytes"] + 1)
        if len(raw) != row["rawBytes"] or sha256(raw) != row["rawSha256"]:
            raise ValueError(f"Raw checksum mismatch: {row['originalPath']}")
        return raw

    # Validate every archive and destination before creating any files.
    for row in manifest["files"]:
        raw = unpack(row)
        target = inside(destination, row["originalPath"])
        if args.restore and target.exists() and target.read_bytes() != raw:
            raise ValueError(f"Refusing to overwrite different bytes: {target}")

    restored = 0
    if args.restore:
        for row in manifest["files"]:
            target = inside(destination, row["originalPath"])
            if target.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            raw = unpack(row)
            with target.open("xb") as output:
                output.write(raw)
            restored += 1
    print(json.dumps({"verifiedFiles": len(manifest["files"]), "restoredFiles": restored,
                      "rawBytes": manifest["totals"]["rawBytes"],
                      "gzipBytes": manifest["totals"]["gzipBytes"],
                      "manifestSha256": expected_manifest_hash}))


if __name__ == "__main__":
    main()
