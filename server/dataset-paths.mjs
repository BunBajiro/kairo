import {join, resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';

export const bundledDatasetDirectory = fileURLToPath(new URL('./data/', import.meta.url));
export function defaultDataDirectory() {
    return process.env.KAIRO_DATA_DIR || join(process.env.LOCALAPPDATA || process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'Kairo');
}
// The supervisor selects one immutable generation before importing the runtime.
// Every official SDE reader uses it for the complete lifetime of that process.
export const activeDatasetDirectory = process.env.KAIRO_SDE_DIRECTORY ? resolve(process.env.KAIRO_SDE_DIRECTORY) : bundledDatasetDirectory;
export function datasetFile(name) {
    if (!/^(?:universe\.json\.gz|universe-provenance\.json|universe-details-\d{3}\.bin|market-categories\.json|npc-market-owners\.json)$/.test(name)) throw new Error('Unknown official dataset file.');
    return join(activeDatasetDirectory, name);
}
