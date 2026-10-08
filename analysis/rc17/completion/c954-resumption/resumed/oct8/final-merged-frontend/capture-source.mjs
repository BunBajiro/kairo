import {captureSource,verifySource} from '../../../../../harness/source-manifest.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const [action,root,output]=process.argv.slice(2);
if(action==='capture')await writeFile(output,JSON.stringify(await captureSource(root),null,2)+'\n');
else if(action==='verify')await verifySource(JSON.parse(await readFile(root,'utf8')));
else throw Error('capture ROOT OUTPUT or verify MANIFEST');
