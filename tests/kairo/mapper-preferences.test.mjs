import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMapperPreferences,readMapperPreferences,mapperPreferencesKey,settledMapFocus} from '../../components/kairo/mapper-preferences.mjs';

test('mapper preferences are opt-in, finite, bounded and pilot scoped',()=>{
  assert.deepEqual(normalizeMapperPreferences(null),{version:1,knownScale:1,wormholeScale:1,focusDetail:false});
  assert.deepEqual(normalizeMapperPreferences({knownScale:Infinity,wormholeScale:'0.5',focusDetail:'true'}),normalizeMapperPreferences(null));
  assert.deepEqual(normalizeMapperPreferences({knownScale:0,wormholeScale:3,focusDetail:true}),{version:1,knownScale:.5,wormholeScale:1.5,focusDetail:true});
  const values=new Map([[mapperPreferencesKey(1),'{"knownScale":0.75,"focusDetail":true}'],[mapperPreferencesKey(2),'bad JSON']]);
  const storage={getItem:key=>values.get(key)};
  assert.equal(readMapperPreferences(1,storage).knownScale,.75);
  assert.equal(readMapperPreferences(2,storage).focusDetail,false);
});
test('settled focus retains near-edge members without admitting outer context',()=>{
  const nodes=[{system_id:1,x:0,y:100},{system_id:2,x:200,y:100},{system_id:3,x:700,y:100}];
  const camera={x:0,y:0,zoom:1},size={width:1000,height:500};
  assert.deepEqual(settledMapFocus(nodes,camera,size),[2]);
  assert.deepEqual(settledMapFocus(nodes,camera,size,[1,2,3]),[1,2,3]);
  assert.deepEqual(settledMapFocus(nodes,{...camera,x:-300},size,[1,2,3]),[3]);
});
