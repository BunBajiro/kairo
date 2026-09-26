import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionConditionPatch, connectionLifeBand, connectionLifeLabel, connectionLifeTone, observedLife} from '../../components/kairo/jspace-connection-model.mjs';
import {connectionEditorPayload} from '../../components/kairo/jspace-workspace-model.mjs';

const now=Date.parse('2026-09-26T10:00:00Z');
test('observed lifetime is a qualitative band independent of exact expiry and mass',()=>{
  const edge={life_band:'under_8h',life_status:'stable',mass:'critical',expires_at:new Date(now+1000).toISOString()};
  assert.equal(connectionLifeLabel(edge),'< 8 hours');assert.equal(connectionLifeTone(edge),'eol');
  assert.equal(connectionLifeLabel({life_status:'eol'}),'End of life');assert.equal(connectionLifeBand({life_status:'eol'}),'unknown');
  assert.equal(connectionLifeLabel({...edge,life_status:'collapsed'}),'Collapsed');
  assert.deepEqual(connectionConditionPatch('life_band','under_4h'),{life_band:'under_4h'});
  assert.deepEqual(connectionConditionPatch('mass','critical'),{mass:'critical'});
  assert.throws(()=>connectionConditionPatch('life_band','4'),/valid/);
});
test('lifetime observation establishes a conservative bound without renewing an earlier expiry',()=>{
  const first=observedLife({life_band:'under_8h'},{},now,null);
  assert.equal(first.expires_at,'2026-09-26T18:00:00.000Z');assert.equal(first.life_observed_at,'2026-09-26T10:00:00.000Z');assert.equal(first.life_status,'stable');
  const later=observedLife({life_band:'under_day'},first,now+3600000,first.expires_at);
  assert.equal(later.expires_at,first.expires_at);assert.equal(later.life_observed_at,'2026-09-26T11:00:00.000Z');
  const critical=observedLife({life_band:'under_4h'},first,now+3600000,first.expires_at);
  assert.equal(critical.expires_at,'2026-09-26T15:00:00.000Z');assert.equal(critical.life_status,'eol');
  assert.equal(observedLife({life_band:'under_day'},first,now+86400000,first.expires_at).expires_at,first.expires_at,'Observation cannot revive an expired route');
  assert.throws(()=>observedLife({life_band:'under_day',life_observed_at:'invalid'},first,now),/observation/);
});
test('ordinary edits and clearing a band preserve prior lifetime evidence',()=>{
  const edge={life_band:'under_4h',life_observed_at:'2026-09-26T09:00:00.000Z',life_status:'eol',expires_at:'2026-09-26T13:00:42.537Z'};
  const payload=connectionEditorPayload({...edge,mass:'reduced',duration_hours:''},'2026-09-26T13:00',edge);
  assert.equal(payload.expires_at,edge.expires_at);assert.equal(Object.hasOwn(payload,'life_band'),false);assert.equal(Object.hasOwn(payload,'life_observed_at'),false);
  assert.equal(observedLife(payload,edge,now).life_observed_at,edge.life_observed_at);
  assert.equal(observedLife({life_band:'unknown'},edge,now).expires_at,edge.expires_at);
  assert.equal(observedLife({life_band:'unknown'},{},now).expires_at,null);
});
test('complete legacy editor records do not turn echoed band fields into fresh observations',()=>{
  const edge={life_band:'unknown',life_observed_at:null,life_status:'eol',expires_at:'2026-09-26T11:00:00.000Z'};
  const explicit='2026-09-26T14:00:00.000Z';
  const edited=observedLife({...edge,duration_hours:4},edge,now,explicit);
  assert.equal(edited.expires_at,explicit);assert.equal(edited.life_status,'eol');assert.equal(edited.life_observed_at,null);
  const massOnly=observedLife({...edge,mass:'reduced'},edge,now,edge.expires_at);
  assert.equal(massOnly.life_observed_at,null);assert.equal(massOnly.life_status,'eol');
});
