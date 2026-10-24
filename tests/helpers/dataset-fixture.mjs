// A coherent test generation based on the shipped CCP data. Only build metadata
// changes; the production readers and validators still exercise real topology,
// celestial shards, market categories and owner records without external HTTP.
import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync, gunzipSync} from 'node:zlib';

const sourceDirectory = fileURLToPath(new URL('../../server/data/', import.meta.url));
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
export const DATASET_TEST_BUILD = 9_000_001;
export const DATASET_TEST_RELEASE = '2026-09-28T11:12:00Z';
export const DATASET_TEST_NOW = Date.parse('2026-09-28T12:00:00Z');
// A gate exposes explicit admission/completion ordering, not a sleep duration.
// Tests that hold accepted work must release it before awaiting owner cleanup.
export function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
}
/**
 * Write a complete candidate into the caller-owned staging directory and return
 * its manifest (the dataset service writes manifest.json). Timestamps are ISO;
 * expectedBuild is a synthetic integer. Output includes real bundled detail
 * bytes, but never publishes active/pending pointers or validates a CCP archive.
 */
export async function writeDatasetFixture({outputDir, expectedBuild = DATASET_TEST_BUILD, releasedAt = DATASET_TEST_RELEASE}) {
    await mkdir(outputDir, {recursive: true});
    const source = `https://developers.eveonline.com/static-data/tranquility/eve-online-static-data-${expectedBuild}-jsonl.zip`;
    const topology = JSON.parse(gunzipSync(await readFile(join(sourceDirectory, 'universe.json.gz'))));
    topology.metadata = {...topology.metadata, build: expectedBuild, releasedAt, source};
    const files = [];
    async function write(name, data) {
        await writeFile(join(outputDir, name), data);
        files.push({name, bytes: data.length, sha256: sha256(data)});
    }
    for (const part of topology.metadata.detailsFiles) {
        const data = await readFile(join(sourceDirectory, part.name));
        await copyFile(join(sourceDirectory, part.name), join(outputDir, part.name));
        files.push({name: part.name, bytes: data.length, sha256: sha256(data)});
    }
    await write('universe.json.gz', gzipSync(JSON.stringify(topology)));
    await write('universe-provenance.json', Buffer.from(JSON.stringify(topology.metadata)));
    for (const name of ['market-categories.json', 'npc-market-owners.json']) {
        const data = JSON.parse(await readFile(join(sourceDirectory, name), 'utf8'));
        await write(name, Buffer.from(JSON.stringify({...data, build: expectedBuild, source})));
    }
    return {schema: 1, build: expectedBuild, releasedAt, source, files};
}
