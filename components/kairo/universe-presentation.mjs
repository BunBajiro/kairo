import {usablePublicConnections} from './universe-map-operations.mjs';

/** Present wormhole systems by class and connections; their SDE regions remain internal. */
export const isWormholeSystem = system => system?.space === 'wormhole';

export function wormholeClassLabel(system) {
 if (!isWormholeSystem(system)) return '';
 const value = Number(system.wormhole_class);
 if (!Number.isInteger(value) || value <= 0) return 'Class unknown';
 // Special classes keep their supplied identity instead of borrowing a region name.
 if (system.name === 'Thera') return 'Thera hub';
 return value <= 6 || value === 13 ? `C${value}` : `Class ${value}`;
}

export function systemLocationLabel(system) {
 if (!system) return 'Location unknown';
 return isWormholeSystem(system) ? `${wormholeClassLabel(system)} · J-Space` : system.region_name || 'K-Space';
}

/** A search always finds systems across both spaces; region and political destinations belong to K-Space. */
export function universeSearchCatalogue(atlas, territories = [], {space = 'known', ownershipAvailable = false} = {}) {
 const systems = (atlas?.systems || []).filter(system => system.space === 'known' || isWormholeSystem(system));
 const destinations = systems.map(system => ({
  id: 'system-' + system.system_id, name: system.name,
  detail: systemLocationLabel(system) + (isWormholeSystem(system) ? '' : ' · K-Space'),
  kind: 'system', value: String(system.system_id),
  search: system.name.toLocaleLowerCase() + ' ' + system.system_id,
 }));
 if (space === 'wormhole') return destinations;
 const knownRegions = new Set(systems.filter(system => !isWormholeSystem(system)).map(system => system.region_id));
 for (const region of atlas?.regions || []) {
  if (!knownRegions.has(region.region_id)) continue;
  destinations.push({id: 'region-' + region.region_id, name: region.name, detail: 'Region · frame its systems', kind: 'region', value: String(region.region_id), search: region.name.toLocaleLowerCase()});
 }
 for (const territory of territories) {
  const source = territory.source === 'inferred' ? 'Inferred group' : territory.source === 'configured' ? 'Configured bloc' : territory.source === 'independent' ? 'Kept independent' : territory.source === 'unassigned' ? 'Unassigned owner' : territory.key.startsWith('f') ? 'Faction sovereignty' : 'Sovereignty owner';
  destinations.push({id: 'territory-' + territory.key, name: territory.name, detail: source + ' · ' + (ownershipAvailable ? territory.systemIds.length.toLocaleString('en-GB') + ' observed systems' : 'awaiting ownership data'), kind: 'territory', value: territory.key, search: territory.name.toLocaleLowerCase(), color: territory.color});
 }
 return destinations;
}

/** Public reports add current knowledge, while private discoveries survive connection expiry. */
export function knownWormholeSystemIds(atlas, intel, selectedSystemId = null, now = Date.now()) {
 const byId = new Map((atlas?.systems || []).map(system => [system.system_id, system]));
 const ids = new Set([
  ...(intel?.pins || []).map(row => row.system_id),
  ...(intel?.discoveredSystemIds || []),
  ...(intel?.links || []).filter(row => row.kind === 'wormhole').flatMap(row => [row.from_system_id, row.to_system_id]),
  ...usablePublicConnections(intel?.feeds, now).flatMap(row => [row.from_system_id, row.to_system_id]),
  intel?.location?.system_id, intel?.operations?.location?.system_id, selectedSystemId,
 ]);
 return new Set([...ids].filter(id => isWormholeSystem(byId.get(id))));
}
