// Mounted consumers own these single-entry caches. No snapshot is retained globally.
export const EMPTY_ROWS = Object.freeze([]);
export const rowTitle = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, x => x.toUpperCase());
const namedKinds = new Set(['skills', 'implants', 'transactions', 'orders', 'loyalty', 'standings', 'fittings', 'jobs', 'planets', 'mining', 'blueprints', 'assets']);
export function rowModelUsesNames(kind) { return namedKinds.has(kind); }
/**
 * Derive labels and asset reference estimates without mutating source rows.
 * Unknown kinds retain the source array; absent prices produce null per-row asset
 * estimates (an unknown valuation), while missing names fall back to IDs.
 */
export function operationRows(source, names, kind, prices) {
  const name = id => names?.[id] || String(id || '—');
  switch (kind) {
    case 'skills': return source.map(s => ({...s, name: name(s.skill_id)}));
    case 'implants': return source.map(id => ({id, name: name(id)}));
    case 'notifications': return source.map(n => ({...n, name: rowTitle(n.type)}));
    case 'journal': return source.map(j => ({...j, name: rowTitle(j.ref_type)}));
    case 'transactions': case 'orders': case 'blueprints': return source.map(r => ({...r, name: name(r.type_id)}));
    case 'loyalty': return source.map(r => ({...r, name: name(r.corporation_id)}));
    case 'standings': return source.map(r => ({...r, name: name(r.from_id)}));
    case 'fittings': return source.map(f => ({...f, hull: name(f.ship_type_id)}));
    case 'jobs': return source.map(j => ({...j, name: name(j.product_type_id || j.blueprint_type_id)}));
    case 'planets': return source.map(p => ({...p, system: name(p.solar_system_id)}));
    case 'mining': return source.map(r => ({...r, name: name(r.type_id), system: name(r.solar_system_id)}));
    case 'assets': return source.map(a => ({...a, name: name(a.type_id), estimate: prices.has(a.type_id) ? (prices.get(a.type_id) || 0) * a.quantity : null, location: a.location_name || name(a.root_location_id || a.location_id)}));
    default: return source;
  }
}
function operationNameIds(source, kind) {
  const ids = new Set();
  for (const row of source) {
    switch (kind) {
      case 'skills': ids.add(row.skill_id); break;
      case 'implants': ids.add(row); break;
      case 'loyalty': ids.add(row.corporation_id); break;
      case 'standings': ids.add(row.from_id); break;
      case 'fittings': ids.add(row.ship_type_id); break;
      case 'jobs': ids.add(row.product_type_id || row.blueprint_type_id); break;
      case 'planets': ids.add(row.solar_system_id); break;
      case 'mining': ids.add(row.type_id); ids.add(row.solar_system_id); break;
      case 'assets': ids.add(row.type_id); if (!row.location_name) ids.add(row.root_location_id || row.location_id); break;
      default: ids.add(row.type_id);
    }
  }
  return [...ids];
}
/**
 * Create one mounted table's cache. Inputs must use immutable source/name/price
 * identities. Only referenced names invalidate derived rows, so unrelated directory
 * updates do not rebuild a large table; only Assets depends on the price map.
 * Do not share this single-entry owner across tabs or pilots.
 */
export function createOperationRowsModel(kind, derive = operationRows) {
  let previousSource, previousNames, previousPrices, nameIds = [], result;
  return (source, names, prices) => {
    const relevantNames = rowModelUsesNames(kind) ? names : undefined;
    const relevantPrices = kind === 'assets' ? prices : undefined;
    const sourceChanged = source !== previousSource;
    if (sourceChanged && rowModelUsesNames(kind)) nameIds = operationNameIds(source, kind);
    const namesChanged = relevantNames !== previousNames && nameIds.some(id => (relevantNames?.[id] || '') !== (previousNames?.[id] || ''));
    if (sourceChanged || namesChanged || relevantPrices !== previousPrices || result === undefined) {
      result = derive(source, relevantNames, kind, relevantPrices);
    }
    previousSource = source; previousNames = relevantNames; previousPrices = relevantPrices;
    return result;
  };
}
/**
 * Map ESI average reference prices by type ID; absent/zero averages become zero,
 * and the last duplicate type wins. These are not executable market quotes.
 */
export function priceMap(rows) { return new Map(rows.map(p => [p.type_id, p.average_price || 0])); }
/**
 * Sum quantity × reference ISK price; missing prices contribute zero to this
 * partial estimate. Per-row rendering separately distinguishes unknown prices.
 */
export function assetReferenceTotal(rows, prices) { return rows.reduce((total, a) => total + ((prices.get(a.type_id) || 0) * a.quantity || 0), 0); }
/**
 * Render at most the first 80 balance-bearing journal rows in reverse order.
 * The source's newest-first order is assumed; this helper does not sort or fetch.
 */
export function walletGraph(rows) {
  return rows.filter(x => typeof x.balance === 'number').slice(0, 80).reverse().map(x => ({date: new Date(x.date).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'}), value: x.balance}));
}

const identityFields = ['id', 'item_id', 'job_id', 'transaction_id', 'order_id', 'skill_id', 'event_id', 'notification_id', 'mail_id', 'fitting_id', 'contract_id', 'jump_clone_id', 'planet_id'];
/**
 * Choose a domain ID/composite key, falling back to the original source index.
 * Call before sorting/filtering so React row identity survives page changes.
 */
export function tableRowIdentity(row, index) {
  for (const field of identityFields) if (row[field] !== undefined && row[field] !== null) return `${field}:${row[field]}`;
  if (row.date !== undefined && row.type_id !== undefined && row.solar_system_id !== undefined) return `mining:${row.date}:${row.type_id}:${row.solar_system_id}`;
  if (row.corporation_id !== undefined) return `corporation:${row.corporation_id}`;
  if (row.from_id !== undefined && row.from_type !== undefined) return `standing:${row.from_type}:${row.from_id}`;
  // Use source position, not position in the current filtered/sorted page.
  return `row:${index}`;
}
export function searchableRow(row) { return Object.values(row).filter(value => typeof value !== 'object').join(' ').toLowerCase(); }
export function compareTableRows(a, b, key, asc) {
  const av = a[key] ?? '', bv = b[key] ?? '';
  return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))) * (asc ? 1 : -1);
}
/**
 * Cache search normalization and filter/sort output for one immutable rows array.
 * Returns `{row,key}` entries, leaving the source untouched; slicing pages must
 * happen afterward so pagination never rebuilds the search index or sorted result.
 * An empty query avoids normalization altogether. See ../../docs/INTERNAL-API.md.
 */
export function createTableModel({normalize = searchableRow, compare = compareTableRows} = {}) {
  let source, entries, texts, previousQuery, previousKey, previousAsc, result;
  /** @param {any[]} rows @param {string} query @param {{key:string, asc:boolean} | null} sort */
  return (rows, query = '', sort = null) => {
    if (source !== rows) {
      source = rows; entries = rows.map((row, index) => ({row, key: tableRowIdentity(row, index)}));
      texts = undefined; result = undefined;
    }
    const normalizedQuery = query.toLowerCase(), key = sort?.key, asc = sort?.asc;
    if (result === undefined || normalizedQuery !== previousQuery || key !== previousKey || asc !== previousAsc) {
      // Empty queries need no normalized text; the first search builds it once for this source.
      if (normalizedQuery && !texts) texts = rows.map(normalize);
      result = normalizedQuery ? entries.filter((_, index) => texts[index].includes(normalizedQuery)) : entries.slice();
      // Preserve filter-then-sort semantics, including mixed numbers/strings and stable ties.
      if (sort) result.sort((a, b) => compare(a.row, b.row, key, asc));
      previousQuery = normalizedQuery; previousKey = key; previousAsc = asc;
    }
    return result;
  };
}
/**
 * Clamp a zero-based requested page to a row count; empty tables still have one
 * page. size is a positive row count (default 30); end is an exclusive slice bound.
 */
export function tablePage(length, requested, size = 30) {
  const pages = Math.max(1, Math.ceil(length / size));
  const page = Math.max(0, Math.min(requested, pages - 1));
  return {pages, page, start: page * size, end: (page + 1) * size};
}
