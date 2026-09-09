"use client";
import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Save} from 'lucide-react';
import {toast} from 'sonner';
import {Panel,Choice} from './ui';
import {useKairo} from './context';
import {api,stamp} from './model';
export function PlaceNotes(props:{system:any;constellation?:any;region?:any}){
 const {boot}=useKairo();const [dirty,setDirty]=useState(false),[place,setPlace]=useState(props);
 const [kind,setKind]=useState('system'),[body,setBody]=useState(''),[tags,setTags]=useState(''),[status,setStatus]=useState('none'),[updated,setUpdated]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{if(!dirty)setPlace(props);},[props.system?.system_id,props.constellation?.name,props.region?.name,dirty]);
 const {system,constellation,region}=place,entities=[{kind:'system',id:system?.system_id,name:system?.name},{kind:'constellation',id:system?.constellation_id,name:constellation?.name},{kind:'region',id:constellation?.region_id,name:region?.name}].filter(e=>e.id),entity=entities.find(e=>e.kind===kind)||entities[0],url=entity?'/places/'+entity.kind+'/'+entity.id:'';
 function fill(n:any){setBody(n.body);setTags(n.tags.join(', '));setStatus(n.status);setUpdated(n.updated||'');setDirty(false);}
 useEffect(()=>{let live=true;setLoading(true);setError('');if(url)api(url).then(n=>{if(live){fill(n);setLoading(false);}}).catch(e=>{if(live){setError(e.message);setLoading(false);}});return()=>{live=false;};},[url]);
 async function save(){if(!entity)return;setBusy(true);try{const n=await api(url,'PUT',{name:entity.name,body,tags:tags.split(','),status},boot.csrf);setUpdated(n.updated);setDirty(false);toast.success('Place details saved.');}catch(e:any){toast.error(e.message);}finally{setBusy(false);}}
 if(!entity)return null;
 return <Panel title="Your field notes" meta={<span className="tag">PRIVATE INTEL</span>} className="mt-5 place-notes"><div className="place-scope-tabs">{entities.map(e=><button key={e.kind} disabled={busy||loading||(dirty&&e.kind!==kind)} className={entity.kind===e.kind?'active':''} onClick={()=>setKind(e.kind)}><small>{e.kind}</small><strong>{e.name||e.id}</strong></button>)}</div><p className="meta">Notes, tags and markers are shared across your Kairo characters and stay in the private dashboard.{dirty?' Save or discard edits before switching places.':''}{dirty&&props.system?.system_id!==system?.system_id?' Keeping your current note open while your location changes.':''}</p>{error&&<p className="inline-error">{error}</p>}<fieldset disabled={busy||loading||!!error} className="stack"><div className="two-grid"><label className="field-label">Personal marker<Choice label="Personal marker" value={status} onChange={v=>{setStatus(v);setDirty(true);}} options={['none','home','staging','watch','avoid','opportunity'].map(value=>({value,label:value==='none'?'No marker':value[0].toUpperCase()+value.slice(1)}))}/></label><label className="field-label">Tags<Input value={tags} onChange={e=>{setTags(e.target.value);setDirty(true);}} placeholder="ratting, logistics, good market" maxLength={400}/></label></div><label className="field-label">Notes for {entity.name||entity.id}<Textarea value={body} onChange={e=>{setBody(e.target.value);setDirty(true);}} rows={6} maxLength={12000} placeholder="Local knowledge, useful stations, routes, resources, contacts, things to watch…"/></label><div className="flex gap-3 flex-wrap items-center"><Button onClick={save} disabled={!dirty}><Save size={15}/> Save details</Button>{dirty&&<Button variant="ghost" onClick={async()=>{try{fill(await api(url));}catch(e:any){toast.error(e.message);}}}>Discard edits</Button>}<span className="meta">{loading?'Loading…':updated?'Saved '+stamp(updated):'No saved details yet'}</span></div></fieldset></Panel>;
}
