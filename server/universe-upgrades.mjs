// SMT infrastructure interchange, pinned to 6b3b4c6a213a349549ef737c89584fc3f048033b:
// EveManager.LoadInfrastructureUpgrades/SaveInfrastructureUpgrades and InfrastructureUpgrade.ToString.
const clean=value=>String(value??'').trim();
const list=atlas=>atlas instanceof Map?[...atlas.values()]:Array.isArray(atlas)?atlas:atlas?.systems||[];

/** Preview only. Consumers must reject the entire import when valid is false. */
export function parseUpgradeImport(input,atlas=[]) {
    const systems=list(atlas),byId=new Map(systems.map(s=>[Number(s.system_id),s])),byName=new Map(systems.map(s=>[s.name.toLowerCase(),s]));
    const resolve=value=>byId.get(Number(value))||byName.get(clean(value).toLowerCase());
    const options=typeof input==='string'?{text:input}:Array.isArray(input)?{upgrades:input}:input||{};
    const entries=[],issues=[],upgrades=[],slots=new Set();let format='smt';
    const issue=(line,raw,message)=>issues.push({line,raw,severity:'error',message});
    function accept(row,line,raw) {
        try {
            if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('Expected an infrastructure upgrade record.');
            const system=resolve(row.system_id??row.system??row.system_name),slot=Number(row.slot),level=Number(row.level??0),name=clean(row.name),notes=clean(row.notes);
            if(!system)throw new Error('Unknown system: '+clean(row.system_id??row.system??row.system_name));
            if(!Number.isInteger(slot)||slot<1||slot>100)throw new Error('Slot must be an integer from 1 to 100.');
            if(!Number.isInteger(level)||level<0||level>5)throw new Error('Level must be an integer from 0 to 5 (zero means no level).');
            if(!name||name.length>240||/[\r\n\t]/.test(name))throw new Error('Use an upgrade name of 1–240 characters without tabs or line breaks.');
            if(typeof row.online!=='boolean')throw new Error('Online state must be true or false.');
            if(notes.length>2000)throw new Error('Notes must be no longer than 2,000 characters.');
            const key=system.system_id+':'+slot;if(slots.has(key))throw new Error('Duplicate slot '+slot+' in '+system.name+'.');
            if(upgrades.length>=1000)throw new Error('Import no more than 1,000 infrastructure upgrades.');
            slots.add(key);const upgrade={system_id:system.system_id,slot,name,level,online:row.online,notes};
            upgrades.push(upgrade);entries.push({line,raw,status:'valid',upgrade});
        }catch(error){entries.push({line,raw,status:'invalid'});issue(line,raw,error.message);}
    }
    let rows=options.upgrades;
    if(rows!==undefined&&!Array.isArray(rows))issue(1,'','Expected an upgrades array.');
    if(rows===undefined) {
        const text=String(options.text||'').replace(/^\uFEFF/,'');
        if(text.length>1_000_000)issue(1,'','Infrastructure import must be no larger than 1,000,000 characters.');
        else if(/^[\s]*[\[{]/.test(text)) {
            format='json';try {const parsed=JSON.parse(text);rows=Array.isArray(parsed)?parsed:parsed?.upgrades;if(!Array.isArray(rows))throw new Error('Expected a JSON array or an object containing upgrades.');}
            catch(error){issue(1,'','Invalid JSON infrastructure import: '+error.message);}
        }else {
            let current=null;
            for(const [index,raw] of text.split(/\r?\n/).entries()) {
                const line=index+1,value=raw.trim();if(!value||value.startsWith('#'))continue;
                const header=value.replace(/^Sovereignty Hub\s+/i,'');
                // Resolve names before numeric rows: valid EVE systems can start with digits.
                const known=byName.get(header.toLowerCase());
                if(known){current=known;continue;}
                if(!/^-?\d+\s/.test(value)){current=null;entries.push({line,raw,status:'invalid'});issue(line,raw,'Unknown system header: '+header);continue;}
                if(!current){entries.push({line,raw,status:'invalid'});issue(line,raw,'Choose a known system header before listing upgrade slots.');continue;}
                const parts=value.split(/\s+/),slot=parts.shift(),status=parts.pop();
                if(!/^(Online|Offline)$/i.test(status||'')){entries.push({line,raw,status:'invalid'});issue(line,raw,'Upgrade rows must end in Online or Offline.');continue;}
                const level=parts.length>1&&/^-?\d+$/.test(parts.at(-1))?Number(parts.pop()):0;
                accept({system_id:current.system_id,slot,name:parts.join(' '),level,online:status.toLowerCase()==='online'},line,raw);
            }
        }
    }
    if(Array.isArray(rows)) {
        format='json';
        if(rows.length>1000)issue(1001,'','Import no more than 1,000 infrastructure upgrades.');
        rows.slice(0,1000).forEach((row,index)=>accept(row,index+1,JSON.stringify(row)));
    }
    if(!upgrades.length&&!issues.length)issue(1,'','No infrastructure upgrades were found.');
    return {format,valid:issues.length===0,upgrades,entries,issues,stats:{entries:entries.length,validEntries:upgrades.length,systems:new Set(upgrades.map(row=>row.system_id)).size,errors:issues.length}};
}

/** SMT cannot carry notes; choose JSON for a durable Kairo notes backup. */
export function exportUpgrades(upgrades,atlas=[],{format='smt'}={}) {
    if(!['smt','json'].includes(format))throw new Error('Choose SMT text or JSON infrastructure export.');
    if(!Array.isArray(upgrades))throw new Error('Expected infrastructure upgrades.');
    if(!upgrades.length)return {format,text:format==='json'?JSON.stringify({version:1,upgrades:[]},null,2)+'\n':'',issues:[],warnings:[]};
    const parsed=parseUpgradeImport({upgrades},atlas);if(!parsed.valid)return {format,text:'',issues:parsed.issues,warnings:[]};
    const systems=new Map(list(atlas).map(s=>[s.system_id,s])),rows=[...parsed.upgrades].sort((a,b)=>systems.get(a.system_id).name.localeCompare(systems.get(b.system_id).name)||a.slot-b.slot);
    if(format==='json')return {format,text:JSON.stringify({version:1,upgrades:rows},null,2)+'\n',issues:[],warnings:[]};
    const groups=new Map();for(const row of rows){if(!groups.has(row.system_id))groups.set(row.system_id,[]);groups.get(row.system_id).push(`${row.slot}\t${row.name}${row.level>0?' '+row.level:''}\t${row.online?'Online':'Offline'}`);}
    return {format,text:[...groups].map(([id,lines])=>systems.get(id).name+'\n'+lines.join('\n')).join('\n\n')+'\n',issues:[],warnings:rows.some(row=>row.notes)?['SMT text does not store notes. Export JSON to preserve Kairo notes.']:[]};
}
