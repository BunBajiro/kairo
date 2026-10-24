import test from 'node:test';
import assert from 'node:assert/strict';
import {isk,stamp} from '../../components/kairo/formatters.mjs';

test('reused number formatter preserves fixed decimal/compact, negative and invalid-value outputs',()=>{
  for(const value of [undefined,null,'10',{},0,-0,0.1,-0.1,1234.56,-1234.56,999999,1e12,NaN,Infinity,-Infinity]) for(const compact of [false,true]) {
    const expected=typeof value==='number'?new Intl.NumberFormat('en-GB',{maximumFractionDigits:compact?2:0,notation:compact?'compact':'standard'}).format(value):'—';
    assert.equal(isk(value,compact),expected,`${String(value)} compact=${compact}`);
  }
});
test('reused EVE stamp preserves UTC, daylight boundaries, empty and invalid dates exactly',()=>{
  for(const value of [undefined,null,'','not a date','2026-03-29T00:59:00Z','2026-03-29T02:00:00+01:00','2026-10-25T01:30:00Z','2026-12-31T23:59:00Z']) {
    const expected=value?new Date(value).toLocaleString('en-GB',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'})+' EVE':'Awaiting data';
    assert.equal(stamp(value),expected);
  }
});
test('formatters are lazy and construct at most one instance per fixed format across a 10000-row fixture',async()=>{
  const NumberFormat=Intl.NumberFormat, DateTimeFormat=Intl.DateTimeFormat;
  let numbers=0,dates=0;
  Intl.NumberFormat=function(...args){numbers++;return new NumberFormat(...args);};
  Intl.DateTimeFormat=function(...args){dates++;return new DateTimeFormat(...args);};
  try {
    const format=await import('../../components/kairo/formatters.mjs?constructor-counts');
    assert.equal(numbers,0); assert.equal(dates,0);
    format.isk(undefined);format.stamp(undefined);format.stamp('invalid');
    assert.equal(numbers,0); assert.equal(dates,0);
    for(let row=0;row<10000;row++) {format.isk(row*1234.56);format.isk(row*1234.56,true);format.stamp('2026-10-07T10:20:00Z');}
    assert.equal(numbers,2); assert.equal(dates,1);
  } finally {Intl.NumberFormat=NumberFormat;Intl.DateTimeFormat=DateTimeFormat;}
});
