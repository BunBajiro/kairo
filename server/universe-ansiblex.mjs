// Compatible with SMT Preferences.xaml.cs ExportJumpGatesBtn/ImportPasteJumpGatesBtn
// at 6b3b4c6a213a349549ef737c89584fc3f048033b. Parse data, never chat markup.
const clean = value => String(value ?? '').trim();
const structureId = value => {
    if (value == null || clean(value) === '' || clean(value) === '0') return null;
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid structure ID.');
    return id;
};
const decode = value => clean(value).replace(/&gt;/gi, '>').replace(/&lt;/gi, '<').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/g, "'");
function cells(line, separator) {
    const values = []; let value = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
        else if (line[i] === separator && !quoted) { values.push(clean(value)); value = ''; }
        else value += line[i];
    }
    if (quoted) throw new Error('Unclosed quoted field.');
    values.push(clean(value)); return values;
}

/** Every non-comment entry is reported. Unknown endpoints and conflicts block import by default. */
export function parseAnsiblexImport(input, systems = []) {
    const options = typeof input === 'string' ? { text: input } : input || {};
    const catalogue = systems instanceof Map ? [...systems.values()] : systems.systems || systems;
    const byId = new Map(catalogue.map(s => [Number(s.system_id), s]));
    const byName = new Map(catalogue.map(s => [s.name.toLowerCase(), s]));
    const resolve = value => byId.get(Number(value)) || byName.get(clean(value).toLowerCase());
    const entries = [], issues = [], formats = new Set(); let header = null, commentCount = 0;
    const issue = (line, raw, message) => issues.push({ line, raw, severity: 'error', message });
    const accept = (row, line, raw, format) => {
        formats.add(format);
        try {
            const from = resolve(row.from_system_id ?? row.from ?? row.From), to = resolve(row.to_system_id ?? row.to ?? row.To);
            if (!from || !to) throw new Error('Unknown system: ' + (!from ? row.from_system_id ?? row.from ?? row.From : row.to_system_id ?? row.to ?? row.To));
            if (from.system_id === to.system_id) throw new Error('A bridge needs different endpoints.');
            const link = { kind: 'ansiblex', from_system_id: from.system_id, to_system_id: to.system_id,
                structure_id: structureId(row.structure_id ?? row.FromID), reverse_structure_id: structureId(row.reverse_structure_id ?? row.ToID),
                directional: row.directional === true, label: clean(row.label).slice(0, 160),
                accessible: row.accessible === undefined ? options.accessible === true : row.accessible === true, enabled: row.enabled !== false,
                source: 'import', import_format: format };
            for (const key of ['owner_alliance_id','reverse_owner_alliance_id']) if (row[key] != null) link[key] = structureId(row[key]);
            for (const key of ['capital_system_id','reverse_capital_system_id']) if (row[key] != null) { const capital = resolve(row[key]); if (!capital) throw new Error('Unknown capital system.'); link[key] = capital.system_id; }
            if (row.reverse_accessible != null) link.reverse_accessible = row.reverse_accessible === true;
            entries.push({ line, raw, status: 'valid', link });
        } catch (error) { entries.push({ line, raw, status: 'invalid' }); issue(line, raw, error.message); }
    };
    if (Array.isArray(options.links)) {
        if (options.links.length > 2000) throw new Error('Import no more than 2,000 entries at a time.');
        options.links.forEach((row, index) => accept(row, index + 1, JSON.stringify(row), 'json'));
    } else {
        const text = String(options.text || '').replace(/^\uFEFF/, '');
        if (text.length > 1_000_000) throw new Error('Ansiblex import is too large.');
        if (text.trim().startsWith('[')) {
            let rows; try { rows = JSON.parse(text); } catch { throw new Error('Invalid JSON bridge list.'); }
            if (!Array.isArray(rows)) throw new Error('Expected a JSON array.');
            return parseAnsiblexImport({ ...options, links: rows }, catalogue);
        }
        for (const [index, raw] of text.split(/\r?\n/).entries()) {
            const line = index + 1, value = raw.trim();
            if (!value) continue;
            if (value.startsWith('#')) { commentCount++; continue; }
            if (entries.length >= 2000) throw new Error('Import no more than 2,000 entries at a time.');
            const chat = [...value.matchAll(/<url=showinfo:35841\/\/(\d+)>(.*?)\s+»\s+(.*?)\s+-\s+.*?<\/url>/gi)];
            if (chat.length) { for (const match of chat) accept({ from: decode(match[2]), to: decode(match[3]), structure_id: match[1], directional: true }, line, match[0], 'smt-chat'); continue; }
            const smt = value.match(/^(\d+)\s+(.+?)\s+-->\s+(.+?)\s*$/);
            if (smt) { accept({ structure_id: smt[1], from: smt[2], to: smt[3], directional: true }, line, raw, 'smt'); continue; }
            try {
                const separator = value.includes('\t') ? '\t' : value.includes(',') ? ',' : value.includes(';') ? ';' : null;
                const parts = separator ? cells(value, separator) : value.split(/\s+>\s+/);
                if (/^(from|from_system|from_system_id|origin)$/i.test(parts[0])) { header = parts.map(p => p.toLowerCase()); continue; }
                if (parts.length < 2) throw new Error('Expected SMT “structureID From --> To”, EVE bridge link, or CSV/TSV.');
                const row = header ? Object.fromEntries(header.map((key, i) => [['origin','from_system'].includes(key) ? 'from' : ['destination','to_system'].includes(key) ? 'to' : key, parts[i]])) : { from: parts[0], to: parts[1], ...(parts[2] && /^\d+$/.test(parts[2]) ? { structure_id: parts[2], label: parts[3] || '' } : { label: parts[2] || '' }) };
                for (const key of ['directional','accessible','reverse_accessible','enabled']) if (typeof row[key] === 'string') {
                    if (!['true','false',''].includes(row[key].toLowerCase())) throw new Error(key + ' must be true or false.');
                    if (row[key] === '') delete row[key]; else row[key] = row[key].toLowerCase() === 'true';
                }
                accept(row, line, raw, 'csv');
            } catch (error) { entries.push({ line, raw, status: 'invalid' }); issue(line, raw, error.message); }
        }
    }
    // Merge only reciprocal endpoint reports. An unpaired SMT line stays directed.
    const directions = new Map();
    for (const entry of entries.filter(e => e.link)) {
        const row = entry.link;
        for (const reverse of row.directional ? [false] : [false, true]) {
            const from = reverse ? row.to_system_id : row.from_system_id, to = reverse ? row.from_system_id : row.to_system_id;
            const id = reverse ? row.reverse_structure_id : row.structure_id, key = from + ':' + to, old = directions.get(key);
            if (old && old.structure_id && id && old.structure_id !== id) { entry.status = 'conflict'; issue(entry.line, entry.raw, 'Conflicting structure IDs for the same directed endpoint.'); continue; }
            const {reverse_accessible,reverse_owner_alliance_id,reverse_capital_system_id,...forward}=row;
            const owner=reverse ? reverse_owner_alliance_id ?? row.owner_alliance_id : row.owner_alliance_id;
            const capital=reverse ? reverse_capital_system_id ?? (!reverse_owner_alliance_id || reverse_owner_alliance_id===row.owner_alliance_id ? row.capital_system_id : null) : row.capital_system_id;
            directions.set(key, { ...forward, from_system_id: from, to_system_id: to, structure_id: id || old?.structure_id || null, reverse_structure_id: null,
                accessible: reverse ? reverse_accessible ?? row.accessible : row.accessible,
                ...(owner!==undefined?{owner_alliance_id:owner}:{}),...(capital!==undefined?{capital_system_id:capital}:{}),directional: true });
        }
    }
    const links = [], used = new Set();
    for (const [key, row] of directions) {
        if (used.has(key)) continue;
        const reverseKey = row.to_system_id + ':' + row.from_system_id, candidate = directions.get(reverseKey),reverse=candidate?.enabled===row.enabled?candidate:null;
        used.add(key); if (reverse) used.add(reverseKey);
        links.push({ ...row, directional: !reverse, reverse_structure_id: reverse?.structure_id || null, ...(reverse ? { reverse_accessible: reverse.accessible,
            ...(reverse.owner_alliance_id!==undefined?{reverse_owner_alliance_id:reverse.owner_alliance_id}:{}),...(reverse.capital_system_id!==undefined?{reverse_capital_system_id:reverse.capital_system_id}:{}) } : {}) });
    }
    return { format: formats.size === 1 ? [...formats][0] : formats.size ? 'mixed' : 'empty', links, entries, issues,
        valid: !issues.length, stats: { entries: entries.length, validEntries: entries.filter(e => e.status === 'valid').length, connections: links.length,
            directedEndpoints: directions.size, reciprocalPairs: links.filter(l => !l.directional).length, comments: commentCount, errors: issues.length } };
}

/** SMT's exact text interchange; zero denotes an unknown endpoint structure ID. */
export function exportAnsiblexSMT(links, systems = []) {
    const catalogue = systems instanceof Map ? [...systems.values()] : systems.systems || systems, lookup = new Map(catalogue.map(s => [s.system_id, s]));
    const regions = new Map(), issues = [];
    for (const row of links) {
        if (row.kind && row.kind !== 'ansiblex') continue;
        const from = lookup.get(row.from_system_id), to = lookup.get(row.to_system_id);
        if (!from || !to) { issues.push({ id: row.id, message: 'Unknown endpoint; cannot export SMT system names.' }); continue; }
        for (const reverse of row.directional === true ? [false] : [false, true]) {
            const origin = reverse ? to : from, destination = reverse ? from : to, region = origin.region_name || 'Connections';
            if (!regions.has(region)) regions.set(region, []);
            regions.get(region).push(`${(reverse ? row.reverse_structure_id : row.structure_id) || 0} ${origin.name} --> ${destination.name}`);
        }
    }
    return { text: [...regions].map(([region, rows]) => '# ' + region + '\n' + rows.join('\n')).join('\n\n') + (regions.size ? '\n' : ''), issues, format: 'smt' };
}
