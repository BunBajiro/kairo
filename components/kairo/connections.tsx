"use client";
import { useEffect, useState } from 'react';
import { Link2, ShieldCheck, ExternalLink, KeyRound, Check, Unplug, Copy, Blocks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useKairo } from './context';
import { api } from './model';
import { Panel, Choice } from './ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PollingSettings } from './polling-settings';
import { SettingsDatasets } from './datasets';
export function Connections() {
    const { boot, reload } = useKairo();
    const [clientId, setClientId] = useState(boot.clientId);
    const [scopes, setScopes] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [remove, setRemove] = useState<number | null>(null);
    const callback = typeof window !== 'undefined' ? window.location.origin + '/auth/eve/callback' : 'http://127.0.0.1:4380/auth/eve/callback';
    useEffect(() => { setClientId(boot.clientId); }, [boot.clientId]);
    async function save() { setBusy(true); try {
        await api('/settings', 'PUT', { clientId }, boot.csrf);
        await reload();
        toast.success('EVE application saved.');
    }
    catch (e: any) {
        toast.error(e.message);
    }
    finally {
        setBusy(false);
    } }
    async function connect(requestedScopes = scopes) { setBusy(true); try {
        if (clientId !== boot.clientId)
            await api('/settings', 'PUT', { clientId }, boot.csrf);
        const r = await api('/auth/start', 'POST', { scopes: requestedScopes }, boot.csrf);
        window.location.assign(r.url);
    }
    catch (e: any) {
        toast.error(e.message);
        setBusy(false);
    } }
    return <div className="connection-grid"><div><Panel title="EVE application" meta={<span className="tag">ONE-TIME SETUP</span>}><div className="setup-steps"><span className="step-num">01</span><div><h3>Register your local application</h3><p>Create an application with EVE’s developer portal. Select <strong>Authentication & API Access</strong> and make the scopes below available.</p><a className="text-link" href="https://developers.eveonline.com/applications" target="_blank" rel="noreferrer">Open EVE developer applications <ExternalLink size={14}/></a></div><span className="step-num">02</span><div><h3>Set the callback address</h3><p>Copy this exact address into your EVE application’s callback URL.</p><div className="copy-line"><code>{callback}</code><Button variant="ghost" size="icon" aria-label="Copy callback address" onClick={() => navigator.clipboard.writeText(callback).then(() => toast.success('Callback address copied.')).catch(() => toast.error('Select and copy the address.'))}><Copy size={15}/></Button></div></div><span className="step-num">03</span><div><h3>Add your Client ID</h3><label className="field-label" htmlFor="client-id">EVE application Client ID</label><div className="flex gap-2"><Input id="client-id" value={clientId} onChange={e => setClientId(e.target.value.trim())} placeholder="Paste the Client ID from EVE" autoComplete="off"/><Button variant="outline" disabled={busy || !clientId} onClick={save}>Save</Button></div><p className="meta mt-3">Kairo uses PKCE. Your Client Secret is not needed.</p></div></div></Panel><Panel title="Connected characters" className="mt-5" meta={<span className="count">{boot.characters.length}</span>}>{boot.characters.length ? boot.characters.map(c => <div className="character-row" key={c.id}><img src={`https://images.evetech.net/characters/${c.id}/portrait?size=64`} alt="" width="48" height="48"/><div><h3>{c.name}</h3><p className="meta">{c.needsReauth ? 'Reconnect to restore access' : c.scopes.length + ' scopes authorized'}</p></div><Button size="sm" variant="outline" disabled={busy} onClick={() => connect([...new Set([...c.scopes, ...scopes, ...boot.modules.filter(m => m.id === 'opsec').flatMap(m => m.scopes)])])}>Update access</Button><Button size="icon" variant="ghost" aria-label={'Disconnect ' + c.name} onClick={() => setRemove(c.id)}><Unplug size={16}/></Button></div>) : <div className="connection-empty"><Link2 size={28}/><p>No characters connected yet.</p><span className="meta">Choose scopes, then sign in with EVE.</span></div>}</Panel><div className="security-note"><ShieldCheck size={20}/><p>Tokens stay on this computer in an encrypted vault. On Windows, the vault key is protected by your Windows account. You can revoke access at any time through <a href="https://developers.eveonline.com/authorized-apps" target="_blank" rel="noreferrer">EVE’s authorized applications</a>.</p></div></div><Panel title="Choose Kairo’s EVE access" meta={<span className="tag">{scopes.length} SCOPES</span>}><p className="muted text-sm mb-5">Choose the modules you want to use. EVE will ask you to approve these permissions for each character.</p><div className="scope-presets"><Button size="sm" variant="outline" onClick={() => setScopes(boot.modules.filter(m => ['pilot', 'training'].includes(m.id)).flatMap(m => m.scopes))}>Pilot essentials</Button><Button size="sm" variant="outline" onClick={() => setScopes([...new Set(boot.modules.flatMap(m => m.scopes))])}>All modules</Button><Button size="sm" variant="ghost" onClick={() => setScopes([])}>Clear</Button></div><div className="scope-list">{boot.modules.filter(m => m.scopes.length).map(m => <div key={m.id} className="scope-group"><label><Checkbox checked={m.scopes.every(s => scopes.includes(s))} onCheckedChange={v => setScopes(v ? [...new Set([...scopes, ...m.scopes])] : scopes.filter(s => !m.scopes.includes(s)))}/><span><strong>{m.name}</strong><small>{m.description}</small></span><span className="meta">{m.scopes.length}</span></label><details><summary>Review individual scopes</summary>{m.scopes.map(s => <label className="individual-scope" key={s}><Checkbox checked={scopes.includes(s)} onCheckedChange={v => setScopes(v ? [...new Set([...scopes, s])] : scopes.filter(x => x !== s))}/><code>{s}</code></label>)}{m.id === 'opsec' && <p className="meta">Personal, corporation and alliance contacts are separate permissions. Add both organization contact scopes to your EVE application before using Update access. EVE may restrict organization data for your character.</p>}{m.id === 'markets' && <p className="meta">NPC station scans need no sign-in. Structure scans use the selected alt’s docking access and structure market scope. Add these scopes to your EVE application before updating access.</p>}{m.id === 'universe' && <p className="meta">Fleet and structure permissions add private operational context. The waypoint permission is only used when you explicitly choose Send to EVE; planning a route never changes your EVE client.</p>}{m.id === 'industry' && <p className="meta">EVE names the PI scope “manage_planets”; Kairo only uses its read endpoints.</p>}</details></div>)}</div><Button className="sso-button" disabled={busy || !clientId} onClick={() => connect()}><Link2 size={18}/>{busy ? 'Connecting to EVE…' : 'Log in with EVE Online'}<ExternalLink size={15}/></Button><p className="meta text-center mt-3">Add the selected scopes to your EVE application, then sign in again. Update access retains existing permissions and adds your selected scopes plus OPSEC contacts.</p></Panel><AlertDialog open={remove !== null} onOpenChange={v => !v && setRemove(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Disconnect this character?</AlertDialogTitle><AlertDialogDescription>Kairo will remove the local tokens and cached ESI data. Your saved journey, notes and goals stay on this computer. Revoke the application in EVE as well to end its authorization.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep connected</AlertDialogCancel><AlertDialogAction onClick={async () => { try {
        await api('/characters/' + remove, 'DELETE', undefined, boot.csrf);
        await reload();
        toast.success('Character disconnected.');
    }
    catch (e: any) {
        toast.error(e.message);
    } setRemove(null); }}>Disconnect</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>;
}
export function Modules() { const { boot, reload, navigate } = useKairo(); const [busy, setBusy] = useState(''); const [tab, setTab] = useState('modules'); useEffect(() => { try { const requested = sessionStorage.getItem('kairo-settings-tab'); sessionStorage.removeItem('kairo-settings-tab'); if (requested === 'universe') { navigate('universe-settings'); } else if (requested && ['modules', 'polling', 'datasets', 'appearance'].includes(requested)) { setTab(requested); } } catch {} }, []); async function toggle(id: string, enabled: boolean) { setBusy(id); try {
    await api('/modules', 'PUT', { id, enabled }, boot.csrf);
    await reload();
}
catch (e: any) {
    toast.error(e.message);
}
finally {
    setBusy('');
} } return <Tabs value={tab} onValueChange={setTab}><TabsList className="page-tabs"><TabsTrigger value="modules">Modules</TabsTrigger><TabsTrigger value="polling">ESI polling</TabsTrigger><TabsTrigger value="datasets">Datasets</TabsTrigger><TabsTrigger value="appearance">Appearance</TabsTrigger></TabsList><TabsContent value="modules"><div className="module-grid">{boot.modules.map(m => <section className={'panel module-card ' + (!m.enabled ? 'module-off' : '')} key={m.id}><div className="flex justify-between"><span className="module-icon"><Blocks size={21}/></span><Switch aria-label={'Enable ' + m.name} checked={m.enabled} disabled={busy === m.id} onCheckedChange={v => toggle(m.id, v)}/></div><h2>{m.name}</h2><p>{m.description}</p><div className="module-footer"><span>{m.scopes.length ? m.scopes.length + ' ESI scopes' : 'Local / public data'}</span><span className={m.enabled ? 'accent' : ''}>{m.enabled ? 'Enabled' : 'Disabled'}</span></div></section>)}</div><p className="meta mt-5">Modules use the shared data service. Disabling a module stops its collection and event subscriptions; existing history is retained.</p></TabsContent><TabsContent value="polling"><PollingSettings/></TabsContent><TabsContent value="datasets"><SettingsDatasets/></TabsContent><TabsContent value="appearance"><Panel title="Appearance"><div className="setting-row"><div><h3>Interface accent</h3><p className="meta">Keep the same visual language across the workspace.</p></div><Choice label="Accent colour" value={boot.settings.theme || 'mint'} options={[{ value: 'mint', label: 'Signal mint' }, { value: 'amber', label: 'Instrument amber' }, { value: 'ice', label: 'Glacial blue' }]} onChange={async (theme) => { try {
    await api('/settings', 'PUT', { theme }, boot.csrf);
    await reload();
}
catch (e: any) {
    toast.error(e.message);
} }}/></div></Panel></TabsContent></Tabs>; }
