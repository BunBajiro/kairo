import test from 'node:test';
import assert from 'node:assert/strict';
import {mostActiveSystem} from '../../lib/session-summary.ts';

const report=(route=[],personal=[],alliance=[])=>({route,personalCombat:{items:personal},allianceCombat:{items:alliance},names:{1:'Home',2:'Combat system',3:'Transit'}});

test('session highlight counts unique personal/alliance killmails and favours combat over time at home',()=>{
 const r=report([{systemId:1,seconds:6000},{systemId:2,seconds:60}],
  [{killmailId:1,systemId:1},{killmailId:2,systemId:2}],
  [{killmailId:1,systemId:1},{killmailId:2,systemId:2},{killmailId:3,systemId:2}]);
 assert.deepEqual(mostActiveSystem(r),{systemId:2,name:'Combat system',seconds:60,killmails:2,measure:'combat'});
});

test('quiet session highlight totals return visits and labels time instead of implying combat',()=>{
 const r=report([{systemId:1,seconds:500},{systemId:3,seconds:800},{systemId:1,seconds:500}]);
 assert.deepEqual(mostActiveSystem(r),{systemId:1,name:'Home',seconds:1000,killmails:0,measure:'time'});
});

test('equal combat counts use observed time, then a stable system tie-break',()=>{
 const r=report([{systemId:3,seconds:400},{systemId:2,seconds:200},{systemId:2,seconds:200}],
  [{killmailId:2,systemId:3},{killmailId:1,systemId:2}]);
 assert.equal(mostActiveSystem(r).systemId,2);
 r.route.push({systemId:3,seconds:1});assert.equal(mostActiveSystem(r).systemId,3);
 r.route.reverse();r.personalCombat.items.reverse();assert.equal(mostActiveSystem(r).systemId,3);
});

test('missing location observations do not invent activity or discard a located killmail',()=>{
 assert.equal(mostActiveSystem(report()),null);
 assert.equal(mostActiveSystem(report([{systemId:1,seconds:0}])),null);
 const result=mostActiveSystem(report([],[],[{killmailId:1,systemId:99}]));
 assert.deepEqual(result,{systemId:99,name:'System 99',seconds:0,killmails:1,measure:'combat'});
});
