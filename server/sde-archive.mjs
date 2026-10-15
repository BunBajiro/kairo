import { open } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { PassThrough, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInflateRaw, crc32 } from 'node:zlib';
import { StringDecoder } from 'node:string_decoder';

const MAX_ARCHIVE = 2 * 1024 ** 3;
const MAX_ENTRY = 4 * 1024 ** 3;
const MAX_LINE = 16 * 1024 ** 2;
const fail = message => { throw new Error(`Invalid SDE archive: ${message}`); };

async function readAt(file, size, position) {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const result = await file.read(bytes, offset, size - offset, position + offset);
    if (!result.bytesRead) fail('truncated ZIP');
    offset += result.bytesRead;
  }
  return bytes;
}

/** Seek to selected ZIP members; never extract paths supplied by an archive. */
export async function openSdeArchive(path, { signal } = {}) {
  signal?.throwIfAborted();
  const file = await open(path, 'r');
  try {
    const size = (await file.stat()).size;
    if (size < 22 || size > MAX_ARCHIVE) fail('unsupported archive size');
    const tail = await readAt(file, Math.min(size, 65557), Math.max(0, size - 65557));
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) { end = i; break; }
    }
    if (end < 0) fail('missing ZIP directory');
    const entries = tail.readUInt16LE(end + 10);
    const directorySize = tail.readUInt32LE(end + 12);
    const directoryOffset = tail.readUInt32LE(end + 16);
    if (tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6) || tail.readUInt16LE(end + 8) !== entries) fail('split ZIP archives are not supported');
    if (!entries || entries > 4096 || directorySize > 16 * 1024 ** 2 || directoryOffset + directorySize > size - 22) fail('invalid ZIP directory bounds');
    const directory = await readAt(file, directorySize, directoryOffset);
    const members = new Map();
    let cursor = 0;
    for (let i = 0; i < entries; i++) {
      if (cursor + 46 > directory.length || directory.readUInt32LE(cursor) !== 0x02014b50) fail('malformed ZIP directory');
      const flags = directory.readUInt16LE(cursor + 8);
      const method = directory.readUInt16LE(cursor + 10);
      const checksum = directory.readUInt32LE(cursor + 16);
      const compressedSize = directory.readUInt32LE(cursor + 20);
      const uncompressedSize = directory.readUInt32LE(cursor + 24);
      const nameLength = directory.readUInt16LE(cursor + 28);
      const extraLength = directory.readUInt16LE(cursor + 30);
      const commentLength = directory.readUInt16LE(cursor + 32);
      const offset = directory.readUInt32LE(cursor + 42);
      const next = cursor + 46 + nameLength + extraLength + commentLength;
      if (next > directory.length) fail('truncated member name');
      const name = directory.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
      if (!name || /[\\\0]/.test(name) || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.split('/').some(part => part === '..' || part === '.')) fail('unsafe member name');
      if (members.has(name)) fail(`duplicate member ${name}`);
      if (flags & 1 || ![0, 8].includes(method)) fail(`unsupported compression for ${name}`);
      if (compressedSize > MAX_ARCHIVE || uncompressedSize > MAX_ENTRY || offset + 30 + compressedSize > directoryOffset) fail(`invalid member bounds for ${name}`);
      if (directory.readUInt16LE(cursor + 34)) fail('split member');
      members.set(name, { name, flags, method, checksum, compressedSize, uncompressedSize, offset });
      cursor = next;
    }
    if (cursor !== directory.length) fail('unexpected ZIP directory data');
    const hashes = {};
    async function* chunks(name) {
      signal?.throwIfAborted();
      const member = members.get(name);
      if (!member) fail(`required member missing: ${name}`);
      const header = await readAt(file, 30, member.offset);
      if (header.readUInt32LE(0) !== 0x04034b50 || header.readUInt16LE(6) !== member.flags || header.readUInt16LE(8) !== member.method) fail(`inconsistent member header: ${name}`);
      const nameLength = header.readUInt16LE(26);
      const dataOffset = member.offset + 30 + nameLength + header.readUInt16LE(28);
      const localName = await readAt(file, nameLength, member.offset + 30);
      if (localName.toString('utf8') !== name || dataOffset + member.compressedSize > directoryOffset) fail(`invalid local member: ${name}`);
      if (!member.compressedSize && member.uncompressedSize) fail(`empty compressed member: ${name}`);
      const digest = createHash('sha256');
      let bytes = 0, checksum = 0;
      const verify = new Transform({
        transform(chunk, _, callback) {
          bytes += chunk.length;
          if (bytes > member.uncompressedSize || bytes > MAX_ENTRY) return callback(new Error(`SDE member exceeds declared size: ${name}`));
          checksum = crc32(chunk, checksum); digest.update(chunk); callback(null, chunk);
        },
        flush(callback) {
          if (bytes !== member.uncompressedSize || checksum !== member.checksum) return callback(new Error(`SDE member CRC/size mismatch: ${name}`));
          hashes[name] = digest.digest('hex'); callback();
        },
      });
      if (!member.compressedSize) {
        if (member.checksum) fail(`invalid empty member: ${name}`);
        hashes[name] = digest.digest('hex'); return;
      }
      const source = createReadStream(path, { start: dataOffset, end: dataOffset + member.compressedSize - 1, highWaterMark: 64 * 1024 });
      const output = new PassThrough();
      const stages = member.method === 8 ? [source, createInflateRaw(), verify, output] : [source, verify, output];
      const completion = pipeline(stages, { signal });
      // Attach immediately: a corrupt member may reject while its consumer parses a row.
      completion.catch(() => {});
      try { for await (const chunk of output) yield chunk; await completion; }
      finally { source.destroy(); output.destroy(); await completion.catch(() => {}); }
    }
    async function* rows(name) {
      const decoder = new StringDecoder('utf8');
      let pending = '', line = 0;
      const parse = text => {
        line++;
        if (!text.trim()) return null;
        try { const row = JSON.parse(text); if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(); return row; }
        catch { throw new Error(`Invalid SDE JSON in ${name}, line ${line}`); }
      };
      for await (const chunk of chunks(name)) {
        pending += decoder.write(chunk);
        let end;
        while ((end = pending.indexOf('\n')) >= 0) {
          if (end > MAX_LINE) fail(`JSON line too large in ${name}`);
          const row = parse(pending.slice(0, end)); pending = pending.slice(end + 1);
          if (row) yield row;
        }
        if (pending.length > MAX_LINE) fail(`JSON line too large in ${name}`);
      }
      pending += decoder.end();
      if (pending.trim()) yield parse(pending);
    }
    return { rows, hashes, members, close: () => file.close() };
  } catch (error) { await file.close(); throw error; }
}
