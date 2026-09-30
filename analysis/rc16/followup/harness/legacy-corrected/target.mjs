import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
if(!process.env.KAIRO_PERF_APP_ROOT) throw new Error('KAIRO_PERF_APP_ROOT is required.');
export const appFile=path=>resolve(process.env.KAIRO_PERF_APP_ROOT,path);
export const appModule=path=>import(pathToFileURL(appFile(path)).href);
