export default {
    id: 'milestones', name: 'Milestone events', version: '1.0.0', description: 'Detects completed skill levels and industry jobs for the timeline and optional stream toasts.', scopes: [], datasets: [],
    register(ctx) {
        const off = [];
        off.push(ctx.on('data.skills', async (e) => { const { current, previous } = e.payload; if (!previous?.skills)
            return; const old = new Map(previous.skills.map(s => [s.skill_id, s.trained_skill_level])); const done = current.skills.filter(s => s.trained_skill_level > (old.get(s.skill_id) || 0)); const names = await ctx.esi.names(done.map(s => s.skill_id)); for (const s of done)
            ctx.publish({ type: 'skill.completed', characterId: e.characterId, summary: (names[s.skill_id] || 'Skill') + ' trained to ' + s.trained_skill_level, payload:{skill_id:s.skill_id,skill_name:names[s.skill_id],level:s.trained_skill_level}, dedupe: `skill:${e.characterId}:${s.skill_id}:${s.trained_skill_level}` }); }));
        off.push(ctx.on('data.jobs', e => { const { current, previous } = e.payload; if (!previous)
            return; const active = new Set(previous.filter(j => j.status === 'active').map(j => j.job_id)); for (const j of current)
            if (active.has(j.job_id) && ['ready', 'delivered'].includes(j.status))
                ctx.publish({ type: 'industry.ready', characterId: e.characterId, summary:'Industry ready: '+(ctx.store.get('names',{})[j.product_type_id]||'product')+' · '+j.runs+' runs',payload:{job_id:j.job_id,product_type_id:j.product_type_id,product_name:ctx.store.get('names',{})[j.product_type_id],runs:j.runs}, dedupe: `job:${e.characterId}:${j.job_id}` }); }));
        off.push(ctx.on('data.journal',e=>{const {current,previous}=e.payload;if(!Array.isArray(previous))return;const old=new Set(previous.map(j=>j.id));for(const j of current||[])if(!old.has(j.id))ctx.publish({type:'wallet.entry',characterId:e.characterId,at:j.date,summary:(j.ref_type||'Wallet entry').replaceAll('_',' ')+': '+new Intl.NumberFormat('en-GB').format(j.amount||0)+' ISK',payload:{journal_id:j.id,amount:j.amount,balance:j.balance,ref_type:j.ref_type},dedupe:'wallet:'+e.characterId+':'+j.id});}));
        return () => off.forEach(f => f());
    }
};
