/** EVE's observed lifetime bands are upper bounds, never precise countdowns. */
export const LIFE_BANDS = Object.freeze([
  {value:'unknown', label:'Unknown', hours:null, tone:'unknown'},
  {value:'under_day', label:'< 1 day', hours:24, tone:'stable'},
  {value:'under_8h', label:'< 8 hours', hours:8, tone:'eol'},
  {value:'under_4h', label:'< 4 hours', hours:4, tone:'critical'},
]);
const byBand = new Map(LIFE_BANDS.map(row => [row.value, row]));

export function connectionLifeBand(connection) { return byBand.has(connection?.life_band) ? connection.life_band : 'unknown'; }
export function connectionLifeLabel(connection) {
  if (connection?.life_status === 'collapsed') return 'Collapsed';
  if (connectionLifeBand(connection) !== 'unknown') return byBand.get(connection.life_band).label;
  return {stable:'Stable',eol:'End of life',critical:'Critical'}[connection?.life_status] || 'Unknown';
}
export function connectionLifeTone(connection) {
  if (connection?.life_status === 'collapsed') return 'collapsed';
  if (connectionLifeBand(connection) !== 'unknown') return byBand.get(connection.life_band).tone;
  return ['stable','eol','critical'].includes(connection?.life_status) ? connection.life_status : 'unknown';
}
export function connectionConditionPatch(field, value) {
  if (field === 'mass' && ['unknown','stable','reduced','critical'].includes(value)) return {mass:value};
  if (field === 'life_band' && byBand.has(value)) return {life_band:value};
  throw new Error('Choose a valid observed connection condition.');
}

/** Recording a band can shorten the routing bound, but can never renew a hole. */
export function observedLife(input, previous = {}, now = Date.now(), expiresAt = previous.expires_at ?? null) {
  // Other Universe editors echo complete records. An unchanged band + timestamp
  // is not a new observation and must not override their explicit legacy state
  // or lifetime edit. A narrow {life_band} quick action is deliberate observation.
  const echoed = Object.hasOwn(input, 'life_observed_at') && input.life_band === previous.life_band && input.life_observed_at === previous.life_observed_at;
  if (!Object.hasOwn(input, 'life_band') || echoed) return {
    life_band: previous.life_band || 'unknown', life_observed_at: previous.life_observed_at || null,
    life_status: input.life_status ?? previous.life_status ?? 'unknown', expires_at: expiresAt,
  };
  const band = byBand.get(input.life_band);
  if (!band) throw new Error('Choose a valid observed wormhole lifetime.');
  const observed = input.life_observed_at == null ? now : Date.parse(input.life_observed_at);
  if (!Number.isFinite(observed) || observed > now + 300000) throw new Error('Choose a valid lifetime observation time.');
  const bound = band.hours == null ? NaN : observed + band.hours * 3600000;
  const candidates = [Date.parse(expiresAt), Date.parse(previous.expires_at), bound].filter(Number.isFinite);
  return {life_band:band.value,life_observed_at:new Date(observed).toISOString(),
    life_status:input.life_status === 'collapsed' || previous.life_status === 'collapsed' ? 'collapsed' : band.value === 'under_4h' ? 'eol' : band.value === 'unknown' ? 'unknown' : 'stable',
    expires_at:candidates.length ? new Date(Math.min(...candidates)).toISOString() : null};
}
