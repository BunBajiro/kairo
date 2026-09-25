/** Local observations are unverified reports. Parsing never changes standings or OPSEC. */
const clean = (value, limit = 4000) => String(value ?? '').replace(/<[^>]*>/g, '').trim().slice(0, limit);
export function createIntelParser(atlas) {
    const exact = new Map(), prefixes = new Map();
    for (const system of atlas.systems || []) {
        const name = system.name.toLowerCase(); exact.set(name, system.system_id);
        for (let length = 3; length < name.length; length++) {
            const prefix = name.slice(0, length);
            if (!prefixes.has(prefix)) prefixes.set(prefix, []);
            prefixes.get(prefix).push(system.system_id);
        }
    }
    return function parseIntel(input, receivedAt) {
        const raw = clean(input.text), source = input.source || 'manual';
        let body = raw, observed = input.observed_at, characterName = null, severity = null;
        const stamped = raw.match(/^\[\s*(\d{4}[.\-]\d{2}[.\-]\d{2}\s+\d{2}:\d{2}:\d{2})\s*\]\s*(.*)$/s);
        if (source !== 'manual' && !stamped) return null;
        if (stamped) {
            observed ||= stamped[1].replace(/\./g, '-').replace(' ', 'T') + 'Z'; body = stamped[2];
            if (source === 'game_log') {
                const match = body.match(/^\(([^)]+)\)\s*(.*)$/s);
                if (!match) return null;
                severity = match[1].toLowerCase(); body = match[2];
            } else {
                const match = body.match(/^([^>]{1,160})\s*>\s*(.*)$/s);
                if (match) { characterName = match[1].trim(); body = match[2]; }
            }
        }
        if (!body || /^(?:channel motd:|channel changed to local\s*:)/i.test(body)) return null;
        const parsed = observed == null ? receivedAt : Date.parse(String(observed));
        if (!Number.isFinite(parsed) || parsed > receivedAt + 300000) return null;
        const tokens = body.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu)?.slice(0, 200) || [];
        const ids = new Set(), ambiguous = new Set();
        for (let i = 0; i < tokens.length; i++) {
            let found = false;
            for (let size = Math.min(5, tokens.length - i); size > 0; size--) {
                const id = exact.get(tokens.slice(i, i + size).join(' '));
                if (id) { ids.add(id); i += size - 1; found = true; break; }
            }
            if (found || tokens[i].length < 3) continue;
            const candidates = prefixes.get(tokens[i]);
            if (candidates?.length === 1) ids.add(candidates[0]);
            else if (candidates?.length > 1) ambiguous.add(tokens[i]);
        }
        const hostileText = body.replace(/\b(?:no|without|clear\s+of)\s+(?:known\s+|any\s+|all\s+)?(?:hostiles?|neuts?|neutrals?|reds?)\b/gi, '');
        const hostileLanguage = /\b(?:hostiles?|neuts?|neutrals?|reds?|tackled|camp(?:ed)?)\b/i.test(hostileText);
        let kind = 'report';
        if (source === 'game_log') {
            if (/decloak|de-cloak|cloak(?:ing)? (?:device )?(?:deactivat(?:es|ed)|disabled)|mobile observatory|dazh liminality locus/i.test(body)) kind = 'decloak';
            else if (severity === 'combat') kind = 'combat';
            else return null;
        } else if (body.includes('?')) kind = 'question';
        else if (!hostileLanguage && (input.clear_keywords || ['clear', 'clr']).some(marker => {
            const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp('(?:^|\\W)' + escaped + '(?:$|\\W)', 'i').test(body) &&
                !new RegExp('\\b(?:not|no|isn[\'’]t|wasn[\'’]t)\\s+(?:\\w+\\s+)?' + escaped + '\\b', 'i').test(body);
        })) kind = 'clear';
        else if (hostileLanguage) kind = 'hostile';
        if (source === 'manual' && ['report', 'hostile', 'clear', 'question'].includes(input.kind)) kind = input.kind;
        const decloak_cause = kind !== 'decloak' ? null : /mobile observatory/i.test(body) ? 'observatory' : /stargate/i.test(body) ? 'gate' : 'other';
        return { source, kind, decloak_cause, channel: clean(input.channel || (source === 'game_log' ? 'Game log' : 'Manual'), 100), text: body,
            system_ids: [...ids].sort((a, b) => a - b), ambiguous_systems: [...ambiguous].sort(),
            observed_at: new Date(parsed).toISOString(), character_name: characterName };
    };
}

/** Unweighted real-gate distance; disconnected and unknown systems remain unknown. */
export function gateDistances(atlas, origins, limit = 20) {
    const neighbors = atlas.neighbors || new Map();
    if (!atlas.neighbors) for (const edge of atlas.gates || []) {
        for (const [from, to] of [[edge.from_system_id, edge.to_system_id], [edge.to_system_id, edge.from_system_id]]) {
            if (!neighbors.has(from)) neighbors.set(from, new Set()); neighbors.get(from).add(to);
        }
    }
    const distances = new Map(origins.map(id => [id, 0])), queue = [...origins];
    for (let i = 0; i < queue.length; i++) {
        const id = queue[i], depth = distances.get(id);
        if (depth >= limit) continue;
        for (const next of neighbors.get(id) || []) if (!distances.has(next)) { distances.set(next, depth + 1); queue.push(next); }
    }
    return distances;
}

export function parseSignatureClipboard(text) {
    const rows = [], seen = new Set(), diagnostics = []; let ignored = 0;
    const lines = String(text || '').split(/\r?\n/);
    if (lines.length > 1000 && lines.slice(1000).some(line => line.trim())) diagnostics.push({ line: 1001, reason: 'Only the first 1,000 lines can be imported.', severity: 'error' });
    for (const [index, line] of lines.slice(0, 1000).entries()) {
        if (!line.trim()) continue;
        const fields = line.split('\t').map(value => clean(value, 240));
        if (fields.length !== 6 || !/^[A-Z0-9]{3}-\d{3}$/i.test(fields[0])) {
            ignored++; diagnostics.push({ line: index + 1, reason: fields.length !== 6 ? 'Expected six tab-separated scanner columns.' : 'Invalid signature ID.', severity: 'error' }); continue;
        }
        if (!/^(?:Cosmic Signature|Kosmische Signatur|Signature cosmique)$/i.test(fields[1])) {
            ignored++; diagnostics.push({ line: index + 1, reason: 'This row is not a supported cosmic signature.',
                severity: /^(?:Cosmic Anomaly|Kosmische Anomalie|Anomalie cosmique)$/i.test(fields[1]) ? 'warning' : 'error' }); continue;
        }
        const signature_id = fields[0].toUpperCase();
        if (seen.has(signature_id)) continue;
        seen.add(signature_id); rows.push({ signature_id, group: fields[1], type: fields[2], name: fields[3] });
    }
    return { rows, ignored, diagnostics };
}
