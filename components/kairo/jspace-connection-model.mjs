/** Connection choices match the mapper conventions; access remains a separate decision. */
export const LIFETIME_PRESETS = Object.freeze([1,4,4.5,16,24,48].map(value => ({value,label:value+'h',tone:value<=1?'critical':value<=4.5?'eol':'stable'})));
export const MASS_STATES = Object.freeze([{value:'critical',label:'Verge'},{value:'reduced',label:'Half'},{value:'stable',label:'Normal'}]);
// Wanderer: freight/H maps to Kairo's existing xlarge; capital/XL is not supercapital.
export const SHIP_SIZES = Object.freeze([{value:'small',label:'S',description:'Small · frigates and destroyers'},{value:'medium',label:'M',description:'Medium · up to battlecruisers'},{value:'large',label:'L',description:'Large · up to battleships'},{value:'xlarge',label:'H',description:'Huge · freighters'},{value:'capital',label:'XL',description:'Extra large · capital ships'}]);
export function connectionLifePreset(connection) {return LIFETIME_PRESETS.some(row=>row.value===connection?.duration_hours)?connection.duration_hours:null;}
export function connectionMassLabel(connection) {return MASS_STATES.find(row=>row.value===connection?.mass)?.label||'Unknown';}
export function connectionShipLabel(connection) {return SHIP_SIZES.find(row=>row.value===connection?.max_ship_size)?.label||connection?.max_ship_size||'Unknown';}

/** Legacy observed lifetime bands remain meaningful when opening existing maps. */
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
  if (connectionLifePreset(connection) != null) return connection.duration_hours+'h';
  if (connectionLifeBand(connection) !== 'unknown') return byBand.get(connection.life_band).label;
  return {stable:'Stable',eol:'End of life',critical:'Critical'}[connection?.life_status] || 'Unknown';
}
export function connectionLifeTone(connection) {
  if (connection?.life_status === 'collapsed') return 'collapsed';
  if (connectionLifePreset(connection) != null) return LIFETIME_PRESETS.find(row=>row.value===connection.duration_hours).tone;
  if (connectionLifeBand(connection) !== 'unknown') return byBand.get(connection.life_band).tone;
  return ['stable','eol','critical'].includes(connection?.life_status) ? connection.life_status : 'unknown';
}
/** Build a narrow quick-action patch; unknown fields/values throw instead of changing another condition. */
export function connectionConditionPatch(field, value) {
  if (field === 'duration_hours' && LIFETIME_PRESETS.some(row=>row.value===Number(value))) return {duration_hours:Number(value)};
  if (field === 'max_ship_size' && SHIP_SIZES.some(row=>row.value===value)) return {max_ship_size:value};
  if (field === 'mass' && ['unknown','stable','reduced','critical'].includes(value)) return {mass:value};
  if (field === 'life_band' && byBand.has(value)) return {life_band:value};
  throw new Error('Choose a valid observed connection condition.');
}

/**
 * Reconcile qualitative lifetime evidence without mutating either record. `now`
 * is Unix ms; `expiresAt` is the expiry already resolved by the command owner.
 * A duration edit keeps that resolved expiry; this helper does not add hours.
 * A new qualitative band can only shorten prior/explicit expiry. Echoed unchanged
 * observation fields do not restamp evidence. Invalid bands or observation times
 * over five minutes in the future throw; unknown evidence may retain null expiry.
 */
export function observedLife(input, previous = {}, now = Date.now(), expiresAt = previous.expires_at ?? null) {
  if (input.duration_hours != null) return {life_band:'unknown',life_observed_at:new Date(now).toISOString(),life_status:input.life_status==='collapsed'?'collapsed':Number(input.duration_hours)<=4.5?'eol':'stable',expires_at:expiresAt};
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
