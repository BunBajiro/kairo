const normalise = value => String(value || '').trim().toLocaleLowerCase('en-GB');
const termsFor = query => normalise(query).split(/\s+/).filter(Boolean);
const score = (name, query) => normalise(name) === query ? 0 : normalise(name).startsWith(query) ? 1 : 2;

/** Every result belongs to a visible node in a user-owned map, never Journey or the source service. */
export function mapSystemIndex(maps, systems) {
  const byId = new Map(systems.map(system => [system.system_id, system]));
  return maps.filter(map => !map.read_only && map.kind !== 'tracking_source').flatMap(map =>
    (map.nodes || []).flatMap(node => {
      const system = byId.get(node.system_id);
      return system ? [{map_id: map.id, map_name: map.name, system, alias: node.alias || '', search: normalise([system.name, node.alias, system.system_id, map.name].join(' '))}] : [];
    }));
}

export function searchMapSystems(index, query, limit = 8) {
  const text = normalise(query), terms = termsFor(query);
  if (!terms.length) return [];
  return index.filter(row => terms.every(term => row.search.includes(term)))
    .sort((a, b) => Math.min(score(a.system.name, text), score(a.alias, text)) - Math.min(score(b.system.name, text), score(b.alias, text)) || a.system.name.localeCompare(b.system.name) || a.map_name.localeCompare(b.map_name))
    .slice(0, Math.max(0, limit));
}

/** Organizational J-Space regions are not destinations or user-facing placement groups. */
export function mapPlacementGroupIndex(atlas) {
  const regions = new Map(), constellations = new Map();
  for (const system of atlas.systems) {
    if (system.space !== 'known') continue;
    for (const [groups, id, name, parent] of [[regions, system.region_id, system.region_name, ''], [constellations, system.constellation_id, system.constellation_name, system.region_name]]) {
      if (!Number.isSafeInteger(id) || id <= 0) continue;
      if (!groups.has(id)) groups.set(id, {id, name: name || String(id), region_name: parent, system_ids: []});
      groups.get(id).system_ids.push(system.system_id);
    }
  }
  const ordered = groups => [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {region: ordered(regions), constellation: ordered(constellations)};
}

export function searchPlacementGroups(groups, query, limit = 7) {
  const text = normalise(query), terms = termsFor(query);
  return groups.filter(group => terms.every(term => normalise([group.name, group.id, group.region_name].join(' ')).includes(term)))
    .sort((a, b) => score(a.name, text) - score(b.name, text) || a.name.localeCompare(b.name)).slice(0, Math.max(0, limit));
}
