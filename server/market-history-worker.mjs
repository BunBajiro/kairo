/**
 * Private worker protocol for market-history.decodeArchive: workerData supplies
 * compressed bytes and one UTC date; return {rows, records} or {error}. records
 * counts validated rows across all regions; rows retains the four core hub regions.
 * No database writes occur here. The parent owns timeout, cancellation and exit.
 */
import {parentPort,workerData} from 'node:worker_threads';
import Bunzip from './vendor/seek-bzip/lib/index.js';
const regions=new Set([10000002,10000043,10000032,10000042]);
// A bounded decoder in a worker keeps decompression off the dashboard/OBS loop.
try {
 const input=Buffer.from(workerData.bytes),output=Buffer.alloc(32*1024*1024);let pos=0,size=0;
 Bunzip.decode(Object.assign(new Bunzip.Stream(),{readByte(){if(pos>=input.length)throw new Error('Truncated archive.');return input[pos++];},eof(){return false;}}),{writeByte(b){if(size>=output.length)throw new Error('History archive is too large.');output[size++]=b;}},false);
 if(pos!==input.length)throw new Error('Unexpected trailing archive data.');
 const lines=output.subarray(0,size).toString('utf8').trimEnd().split(/\r?\n/),head=lines.shift().split(',');
 const keys=['average','date','highest','lowest','order_count','volume','http_last_modified','region_id','type_id'];
 if(keys.some(k=>!head.includes(k))||head.length!==new Set(head).size)throw new Error('Unrecognized EVE Ref CSV columns.');
 const seen=new Set(),rows=[];let records=0;
 for(const line of lines){if(!line)continue;const cells=line.split(',').map(s=>s.startsWith('"')&&s.endsWith('"')?s.slice(1,-1):s);if(cells.length!==head.length)throw new Error('Malformed history row.');const r=Object.fromEntries(head.map((h,i)=>[h,cells[i]]));
  for(const k of ['average','highest','lowest','order_count','volume','region_id','type_id']){if(!r[k]?.trim())throw new Error('Empty history value.');r[k]=Number(r[k]);if(!Number.isFinite(r[k])||r[k]<0)throw new Error('Invalid history value.');}
  if(r.date!==workerData.date||!Number.isFinite(Date.parse(r.http_last_modified))||!Number.isSafeInteger(r.volume)||!Number.isSafeInteger(r.order_count)||!Number.isSafeInteger(r.region_id)||r.region_id<1||!Number.isSafeInteger(r.type_id)||r.type_id<1||r.highest<r.lowest)throw new Error('Invalid history record.');
  const key=r.region_id+':'+r.type_id;if(seen.has(key))throw new Error('Duplicate history record.');seen.add(key);if(++records>250000)throw new Error('Too many records in history archive.');
  if(regions.has(r.region_id))rows.push(r);
 }
 if(!records)throw new Error('Empty history archive.');
 parentPort.postMessage({rows,records});
}catch(e){parentPort.postMessage({error:e.message});}
