// Self-locking corrected backend-only ABBA. Original legacy harness stays frozen.
import {spawn} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
if(process.argv.length!==5)throw Error('Usage: node legacy-corrected-run.mjs <stable-root> <rc16-root> <output>');
const code=await new Promise((done,reject)=>{const child=spawn('flock',['-x','/tmp/kairo-rc16-benchmark.lock',process.execPath,join(here,'legacy-corrected/abba.mjs'),...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,KAIRO_LEGACY_CORRECTED_LOCKED:'1'}});child.on('error',reject);child.on('exit',code=>done(code??1));});
process.exit(code);
