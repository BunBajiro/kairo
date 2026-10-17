/**
 * Registry extension translating fresh dataset transitions into durable events.
 * The first snapshot establishes a baseline and emits no historical completions.
 * Skill/job ownership uses receipt time captured by Core before awaited names;
 * wallet entries instead use their provider occurrence date. Stable pilot/entity
 * dedupe keys keep repeat observations from repeating timeline rows or toasts.
 * See docs/INTERNAL-API.md for event ownership and Registry cleanup contracts.
 */
import {captureSessionObservation} from '../session-travel.mjs';

export default {
    id: 'milestones', name: 'Milestone events', version: '1.0.0', description: 'Detects completed skill levels and industry jobs for the timeline and optional stream toasts.', scopes: [], datasets: [],
    // Return asynchronous listener work to the bus, so accepted transitions
    // finish before Registry/Store teardown. The disposer only removes listeners.
    register(ctx) {
        const off = [];
        off.push(ctx.on('data.skills', async e => {
            const {current, previous} = e.payload;
            if (!previous?.skills) return;
            const old = new Map(previous.skills.map(s => [s.skill_id, s.trained_skill_level]));
            const done = current.skills.filter(s => s.trained_skill_level > (old.get(s.skill_id) || 0));
            if (!done.length) return;
            const observation = e.payload.observation || captureSessionObservation(ctx.store, {characterId: e.characterId});
            if (observation.characterId !== e.characterId) return;
            // The source snapshot is already saved. Optional display metadata
            // must neither lose this transition nor move it into another Session.
            let names = ctx.store.get('names', {});
            try { names = {...names, ...await ctx.esi.names(done.map(s => s.skill_id))}; }
            catch { /* Persist the observed completion with the available label. */ }
            for (const s of done) ctx.publish({
                type: 'skill.completed', characterId: e.characterId, at: observation.at,
                summary: (names[s.skill_id] || 'Skill') + ' trained to ' + s.trained_skill_level,
                payload: {skill_id: s.skill_id, skill_name: names[s.skill_id], level: s.trained_skill_level, session_id: observation.sessionId},
                dedupe: `skill:${e.characterId}:${s.skill_id}:${s.trained_skill_level}`
            });
        }));
        off.push(ctx.on('data.jobs', e => {
            const {current, previous} = e.payload;
            if (!previous) return;
            const active = new Set(previous.filter(j => j.status === 'active').map(j => j.job_id));
            const done = current.filter(j => active.has(j.job_id) && ['ready', 'delivered'].includes(j.status));
            if (!done.length) return;
            const observation = e.payload.observation || captureSessionObservation(ctx.store, {characterId: e.characterId});
            if (observation.characterId !== e.characterId) return;
            const names = ctx.store.get('names', {});
            for (const j of done) ctx.publish({
                type: 'industry.ready', characterId: e.characterId, at: observation.at,
                summary: 'Industry ready: ' + (names[j.product_type_id] || 'product') + ' · ' + j.runs + ' runs',
                payload: {job_id: j.job_id, product_type_id: j.product_type_id, product_name: names[j.product_type_id], runs: j.runs, session_id: observation.sessionId},
                dedupe: `job:${e.characterId}:${j.job_id}`
            });
        }));
        off.push(ctx.on('data.journal',e=>{
            const {current,previous}=e.payload;if(!Array.isArray(previous))return;
            const old=new Set(previous.map(j=>j.id));
            for(const j of current||[])if(!old.has(j.id)){
                // ESI may omit fractional seconds. Persist the same UTC precision
                // as Session boundaries so indexed text ranges remain chronological.
                const time=Date.parse(j.date),at=Number.isFinite(time)?new Date(time).toISOString():j.date;
                ctx.publish({type:'wallet.entry',characterId:e.characterId,at,summary:(j.ref_type||'Wallet entry').replaceAll('_',' ')+': '+new Intl.NumberFormat('en-GB').format(j.amount||0)+' ISK',payload:{journal_id:j.id,amount:j.amount,balance:j.balance,ref_type:j.ref_type},dedupe:'wallet:'+e.characterId+':'+j.id});
            }
        }));
        return () => off.forEach(f => f());
    }
};
