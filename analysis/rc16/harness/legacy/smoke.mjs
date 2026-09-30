import assert from 'node:assert/strict';
import {fixtureProcess} from './process.mjs';
const worker=await fixtureProcess('typical',true);
try {
  for(const name of ['opsec','state','journey','session','market_browse','market_report','imports_warm','imports_after_write']) {
    const result=await worker.rpc('bench',{name,iterations:1,warmups:1});
    assert.equal(result.networkAttempts,0);console.log(name+' OK');
  }
}finally{await worker.close();}
