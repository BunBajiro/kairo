import {captureSource} from '../../../../harness/source-manifest.mjs';
import {writeFile} from 'node:fs/promises';
await writeFile(process.argv[3],JSON.stringify(await captureSource(process.argv[2]),null,2)+'\n',{flag:'wx'});
