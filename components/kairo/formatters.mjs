// Fixed, lazy formatters avoid per-cell constructors without an import-time Intl cost.
let decimal, compact, eveTime;
export function isk(n, abbreviated = false) {
  if (typeof n !== 'number') return '—';
  if (abbreviated) {
    compact ||= new Intl.NumberFormat('en-GB', {maximumFractionDigits: 2, notation: 'compact'});
    return compact.format(n);
  }
  decimal ||= new Intl.NumberFormat('en-GB', {maximumFractionDigits: 0, notation: 'standard'});
  return decimal.format(n);
}
export function stamp(value) {
  if (!value) return 'Awaiting data';
  const date = new Date(value);
  // Date#toLocaleString returned this text for invalid input; Intl#format would throw.
  if (Number.isNaN(date.getTime())) return 'Invalid Date EVE';
  eveTime ||= new Intl.DateTimeFormat('en-GB', {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC'});
  return eveTime.format(date) + ' EVE';
}
