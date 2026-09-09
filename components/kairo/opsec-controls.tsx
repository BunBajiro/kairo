"use client";
import {useState} from 'react';
import {ArrowUpRight, ShieldCheck, Link2, CheckCircle2, CircleDashed} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Switch} from '@/components/ui/switch';
import {toast} from 'sonner';
import {useKairo} from './context';
import {api, stamp} from './model';
import {Panel, Choice} from './ui';
import {OBSControls} from './obs-controls';
import {spaceStates, protectionLabel} from '@/public/stream/protection.js';
const descriptions: Record<string,string> = {
    blue: 'Excellent (+10) or Good (+5) standing; your own alliance and explicit blue policy.',
    hostile: 'Terrible (−10) or Bad (−5) standing, or explicit hostile policy.',
    lowsec: 'Known-space systems with displayed security from 0.1 to 0.4.',
    neutral: 'Neutral or no standing for the sovereignty holder; unclaimed null-sec.',
    highsec: 'Known-space systems with displayed security from 0.5 to 1.0.',
    triglavian: 'Pochven and identified Abyssal Deadspace systems.',
    anoikis: 'J-space and other identified wormhole systems.',
    unknown: 'Missing, outdated or unsupported context. Protection remains engaged.',
};
const sourceLabels: Record<string,string> = {contacts:'Personal contacts',corporation_contacts:'Corporation contacts',alliance_contacts:'Alliance contacts'};
export function OPSEC() {
    const {boot,opsec,reload,refresh,navigate} = useKairo();
    const [settings,setSettings] = useState<any>(boot.settings.opsec);
    const [blue,setBlue] = useState((settings.blueAlliances||[]).join(', '));
    const [hostile,setHostile] = useState((settings.hostileAlliances||[]).join(', '));
    const [busy,setBusy] = useState(false);
    async function save(next=settings) {
        setBusy(true);
        try {
            await api('/opsec','PUT',{...next,blueAlliances:blue.split(',').map(Number).filter(Boolean),hostileAlliances:hostile.split(',').map(Number).filter(Boolean)},boot.csrf);
            setSettings(next); await reload(); await refresh(); toast.success('Broadcast protection updated.');
        } catch(e:any) {toast.error(e.message);} finally {setBusy(false);}
    }
    return <>
        <section className={'opsec-banner '+opsec?.state}>
            <ShieldCheck size={36}/><div><p className="eyebrow">CURRENT PROTECTION STATE</p><h2>{protectionLabel(opsec?.state)}</h2><p>{opsec?.reason||'Awaiting verified ESI context.'}</p></div>
            <span className="protection-badge">{opsec?.pending?'UPDATING · COVERED':opsec?.hidden?'COVERS REQUIRED':'HIGH-SEC · COVERS RELEASED'}</span>
        </section>
        <div className="two-grid">
            <Panel title="Broadcast control">
                <div className="setting-row"><div><h3>Force protection on</h3><p className="meta">Manual protection takes priority over every space category.</p></div><Switch checked={settings.manual} aria-label="Force protection on" disabled={busy} onCheckedChange={manual=>save({...settings,manual})}/></div>
                <div className="setting-row"><div><h3>Release covers in High-Sec</h3><p className="meta">Applies to verified High-Sec outside faction warfare. OBS actions are configured below.</p></div><Switch checked={settings.allowHighsec} aria-label="Release covers in High-Sec" onCheckedChange={allowHighsec=>setSettings({...settings,allowHighsec})}/></div>
                <label className="field-label mt-5">Character to protect<Choice label="Protected character" value={String(settings.characterId||0)} onChange={id=>setSettings({...settings,characterId:Number(id)})} options={[{value:'0',label:'First connected character'},...boot.characters.map(c=>({value:String(c.id),label:c.name}))]}/></label>
                <Button className="mt-5" disabled={busy} onClick={()=>save()}>Save protection rules</Button>
                <p className="meta mt-5">Place and enable covers in Stream Studio over the parts of your EVE UI you want protected.</p><Button variant="outline" className="mt-3" onClick={()=>navigate('studio')}>Position OPSEC covers <ArrowUpRight size={15}/></Button>
            </Panel>
            <Panel title="Sovereignty & standings">
                <p className="muted text-sm mb-5">Both Good and Excellent standings classify as Blue. Bad and Terrible classify as Hostile.</p>
                <label className="field-label">Blue alliance IDs<Input value={blue} onChange={e=>setBlue(e.target.value)} placeholder="Comma-separated EVE alliance IDs"/></label>
                <label className="field-label mt-5">Hostile alliance IDs<Input value={hostile} onChange={e=>setHostile(e.target.value)} placeholder="Comma-separated EVE alliance IDs"/></label>
                <p className="meta mt-5">Your explicit policy wins, then your own alliance. For other owners, Kairo uses the first matching entry from available personal, corporation, then alliance contacts. An explicit Neutral entry also takes precedence over less specific lists.</p>
            </Panel>
        </div>
        <Panel title="Standings access" className="mt-5" meta={<Button variant="ghost" size="sm" onClick={()=>navigate('connections')}><Link2 size={14}/> Update EVE access</Button>}>
            <div className="standing-sources">{['contacts','corporation_contacts','alliance_contacts'].map(key=>{
                const source=opsec?.standingSources?.find((s:any)=>s.key===key), ready=source?.status==='ready';
                const state=source?.status==='missing_scope'?'Permission needed':source?.status==='not_applicable'?'No organization':source?.status==='disabled'?'Module disabled':ready?'Available':source?.status==='error'||source?.status==='stale'?'Unavailable':'Waiting';
                return <div className="standing-source" key={key}>{ready?<CheckCircle2 size={18}/>:<CircleDashed size={18}/>}<div><h3>{sourceLabels[key]}</h3><p>{state}{ready?' · '+source.count+' alliance entries':''}</p>{source?.updatedAt&&<small>Updated {stamp(source.updatedAt)}</small>}{source?.error&&<small>{source.error}</small>}</div></div>;
            })}</div>
            <p className="meta mt-4">Organization standings need their own EVE permissions. In Connections, add the OPSEC scopes to your EVE application, then use Update access for your character. Unavailable lists are identified here; Kairo never treats a failed request as an empty list.</p>
        </Panel>
        <Panel title="Space categories" className="mt-5"><div className="opsec-legend">{spaceStates.map(key=><div className="space-category" key={key}><span className={'state-label '+key}>{protectionLabel(key)}</span><p>{descriptions[key]}</p></div>)}</div>
            <div className="protection-overrides"><div><span className="state-label manual">Manual override</span><p>Always covered until released.</p></div><div><span className="state-label fw">Faction Warfare override</span><p>Detected warzones remain covered with their existing OBS rules.</p></div></div>
            <p className="meta mt-5">Manual protection takes priority, then special space, faction warfare, sovereignty standings and security. Brief data gaps retain the last covered category for up to 30 seconds after the last verified location. Longer gaps become Unknown. ESI can miss fast transits; use manual protection when immediate concealment is needed.</p>
        </Panel>
        <OBSControls/>
    </>;
}
