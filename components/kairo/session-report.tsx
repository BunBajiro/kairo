"use client";
import {Children,isValidElement,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Activity,ArrowRight,BookOpen,ChevronDown,Clock,Coins,ExternalLink,Flag,MapPin,RefreshCw,Save,Shield,Ship,Swords,Wallet,X,type LucideIcon} from 'lucide-react';
import {toast} from 'sonner';
import {useKairo} from './context';
import {api,isk,stamp} from './model';
import {CombatCoverage} from './combat-coverage';
import {mostActiveSystem} from '@/lib/session-summary';

const duration=(n:number)=>n<60?Math.floor(n)+'s':n<3600?Math.floor(n/60)+'m':Math.floor(n/3600)+'h '+Math.floor(n%3600/60)+'m';
const number=(n:number)=>n.toLocaleString('en-GB');
const signed=(n:number)=> (n>0?'+':'')+number(n);
const valueLabel=(value:number,missing:number)=>isk(value,true)+(missing?' + unpriced':'')+' ISK';
const coverageLabels:Record<string,string>={ready:'Published records collected',collecting:'Collecting system records…',partial:'Collection incomplete',waiting:'Waiting for collection',error:'Public source unavailable',stale:'Saved records · retry pending',disabled:'Combat collection paused',no_alliance:'No alliance at session start',unavailable:'Alliance was not recorded'};

type ReportCardProps={cardId:string;icon:LucideIcon;title:string;subtitle:string;children:ReactNode;preview:ReactNode;status:string;tone?:string;wide?:boolean;expanded?:boolean;onToggle?:()=>void;controlId?:string;regionId?:string};
function ReportCard({cardId,icon:Icon,title,subtitle,preview,status,tone='activity',wide=false,expanded=false,onToggle,controlId,regionId}:ReportCardProps){
 return <button type="button" id={controlId} className={'session-detail-card'+(wide?' session-detail-wide':'')} data-card={cardId} data-tone={tone} aria-expanded={expanded} aria-controls={expanded?regionId:undefined} aria-labelledby={controlId+'-title'} onClick={onToggle}>
  <span className="session-detail-heading"><span className="session-detail-icon"><Icon size={21}/></span><span><strong id={controlId+'-title'}>{title}</strong><small>{subtitle}</small></span><ChevronDown size={18} className="session-card-chevron"/></span>
  <span className="session-detail-preview">{preview}</span>
  <span className="session-card-bottom"><span className="session-card-status">{status}</span><span className="session-expand-hint">{expanded?'Hide details':'Explore details'} <ArrowRight size={14}/></span></span>
 </button>;
}
// Keep each pair's heading, preview and footer on shared grid tracks. Details
// live below the pair so opening a long table cannot stretch the other card.
function ReportGrid({children}:{children:ReactNode}){
 const prefix=useId(),[expanded,setExpanded]=useState<string|null>(null),panel=useRef<HTMLElement>(null);
 const cards=Children.toArray(children).filter(isValidElement<ReportCardProps>);
 const rows=Array.from({length:Math.ceil(cards.length/2)},(_,i)=>cards.slice(i*2,i*2+2));
 useEffect(()=>{if(expanded){panel.current?.focus({preventScroll:true});panel.current?.scrollIntoView({block:'nearest'});}},[expanded]);
 function close(){const opener=document.getElementById(prefix+'-'+expanded);setExpanded(null);opener?.focus();}
 return <div className="session-detail-grid">{rows.map(row=>{
  const active=row.find(card=>card.props.cardId===expanded),Icon=active?.props.icon;
  return <div className="session-detail-row" key={row[0].props.cardId}>
   {row.map(card=><ReportCard {...card.props} key={card.props.cardId} controlId={prefix+'-'+card.props.cardId} regionId={prefix+'-'+card.props.cardId+'-details'} expanded={expanded===card.props.cardId} onToggle={()=>setExpanded(old=>old===card.props.cardId?null:card.props.cardId)}/>)}
   {active&&<section ref={panel} tabIndex={-1} role="region" aria-labelledby={prefix+'-'+active.props.cardId+'-title'} id={prefix+'-'+active.props.cardId+'-details'} className="session-expanded-panel" data-card={active.props.cardId}>
    <div className="session-expanded-heading"><h3>{Icon&&<Icon size={19}/>} {active.props.title}</h3><Button variant="ghost" size="sm" onClick={close}><X size={15}/> Close details</Button></div>
    <div className="session-detail-body">{active.props.children}</div>
   </section>}
  </div>;
 })}</div>;
}
function Metric({label,value,tone='',unit,state=false}:{label:string;value:ReactNode;tone?:string;unit?:string;state?:boolean}){return <span className={'session-mini-metric '+tone+(state?' session-metric-state':'')}><strong>{value}{unit&&<small>{unit}</small>}</strong><small>{label}</small></span>;}
function KillList({items,names,alliance=false}:{items:any[];names:Record<string,string>;alliance?:boolean}){
 const [limit,setLimit]=useState(30);
 if(!items.length)return <p className="meta">No matching killmails have been recorded.</p>;
 return <><div className="session-kill-list">{items.slice(0,limit).map(k=><a key={k.killmailId} href={'https://zkillboard.com/kill/'+k.killmailId+'/'} target="_blank" rel="noreferrer"><span className={'session-result '+(k.result==='loss'||k.loss?'negative':'positive')}>{(alliance?k.loss:k.result==='loss')?'LOSS':'KILL'}</span><span><strong>{names[k.shipTypeId]||'Hull '+k.shipTypeId}</strong><small>{names[k.systemId]||'System '+k.systemId} · {stamp(k.at)}</small></span><span className="session-kill-value">{k.value===null?'Unpriced':isk(k.value,true)+' ISK'}</span><ExternalLink size={13}/></a>)}</div>{items.length>limit&&<Button variant="outline" size="sm" onClick={()=>setLimit(n=>n+30)}>Show more killmails ({items.length-limit})</Button>}</>;
}
function RouteVisits({route}:{route:any[]}){
 const [limit,setLimit]=useState(40);
 return <><ol className="session-route-list">{route.slice(0,limit).map((v,i)=><li key={v.id}><span className="session-route-index">{String(i+1).padStart(2,'0')}</span><details><summary><span><strong>{v.name}</strong><small>{v.regionName||'Region not recorded'}</small></span><span className="session-visit-time">{duration(v.seconds)}</span>{v.combatActive&&<span className="session-buffer-badge">±10m combat window</span>}<ChevronDown size={14}/></summary><div className="session-visit-detail"><p>Entry: {stamp(v.entered)}{v.clipped?' · session start':''}<br/>Exit: {v.active?'In progress · latest report':stamp(v.exited)}</p><p>{v.combatActive?'Alliance combat occurred during this visit, so its alliance kill/loss window extends ten minutes before entry and after exit.':'This visit remains in your route. No alliance combat has been found during the visit, so no extra combat window applies.'}</p>{v.security!==undefined&&v.security!==null&&<p>Security: {v.security.toFixed(2)}</p>}{v.inferred&&<p>Starting location inferred from the last saved visit.</p>}</div></details></li>)}</ol>{route.length>limit&&<Button variant="outline" onClick={()=>setLimit(n=>n+40)}>Show more visits ({route.length-limit})</Button>}</>;
}

export function SessionReport({id,onClose,onSaved}:{id:string;onClose:()=>void;onSaved:()=>void}){
 const {boot,character}=useKairo();
 const summaryId=useId();
 const [report,setReport]=useState<any>(null),[name,setName]=useState(''),[notes,setNotes]=useState(''),[busy,setBusy]=useState(false),[refreshing,setRefreshing]=useState(false),[loadingMore,setLoadingMore]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),reportRef=useRef<any>(null),requestVersion=useRef(0),requestingMore=useRef(false);
 const url='/sessions/'+encodeURIComponent(id)+'?character='+character;
 useEffect(()=>{
  const g=++generation.current;let running=false;
  setReport(null);reportRef.current=null;setError('');setName('');setNotes('');setBusy(false);setRefreshing(false);setLoadingMore(false);requestingMore.current=false;
  async function read(initial=false){
   if(running||requestingMore.current||(!initial&&(document.hidden||reportRef.current?.collection?.phase==='static'))||(!initial&&(reportRef.current?.events.length||0)>100))return;
   running=true;const request=++requestVersion.current;
   try{const next=await api(url);if(g!==generation.current||request!==requestVersion.current)return;const first=!reportRef.current;reportRef.current=next;setReport(next);if(first){setName(next.session.label);setNotes(next.session.notes||'');}setError('');}
   catch(e:any){if(g===generation.current)setError(e.message);}
   finally{running=false;}
  }
  read(true);const timer=setInterval(()=>read(),15000);
  return()=>{generation.current++;clearInterval(timer);};
 },[url]);
 async function refreshReport(){
  const g=generation.current,request=++requestVersion.current;setRefreshing(true);
  try{const next=await api(url);if(g===generation.current&&request===requestVersion.current){reportRef.current=next;setReport(next);setError('');}}
  catch(e:any){if(g===generation.current)setError(e.message);}
  finally{if(g===generation.current)setRefreshing(false);}
 }
 async function save(){
  const g=generation.current;setBusy(true);
  try{await api(url,'PUT',{label:name,notes},boot.csrf);if(g===generation.current){onSaved();toast.success('Session details saved.');}}
  catch(e:any){if(g===generation.current)toast.error(e.message);}
  finally{if(g===generation.current)setBusy(false);}
 }
 async function moreEvents(){
  const g=generation.current,request=++requestVersion.current;setLoadingMore(true);requestingMore.current=true;
  try{const next=await api(url+'&offset='+report.events.length);if(g===generation.current&&request===requestVersion.current){const events=[...new Map([...report.events,...next.events].map((e:any)=>[e.id,e])).values()];const value={...next,events};reportRef.current=value;setReport(value);}}
  catch(e:any){if(g===generation.current)toast.error(e.message);}
  finally{if(g===generation.current){setLoadingMore(false);requestingMore.current=false;}}
 }
 const s=report?.stats,alliance=report?.allianceCombat,lp=report?.loyalty,personal=report?.personalCombat;
 const pilot=boot.characters.find(c=>c.id===character)?.name||'Pilot';
 const lpHeadline=lp?.status==='unavailable'?'Not recorded':lp?.status==='overlap'?'Uncertain':lp?.sameSample&&lp?.status==='pending'?'Awaiting sample':signed(lp?.delta||0);
 const lpIsState=lp?.status==='unavailable'||lp?.status==='overlap'||(lp?.sameSample&&lp?.status==='pending');
 const lpStatus=({unavailable:'LP samples unavailable',pending:'Awaiting reconciliation',live:'Latest observed balance',delayed:'Delayed estimate',overlap:'Overlapping samples · uncertain'} as Record<string,string>)[lp?.status]||'Personal LP';
 const activity=report?mostActiveSystem(report):null;
 const phase=report?.collection?.phase,feed=report?.liveFeed;
 const collectionLabel=phase==='static'?'Session archived · zKill checks finished':alliance?.coverage.status==='disabled'?'Combat collection paused':phase==='live'?'Live session · zKill checks every 2 minutes':'Session ended · delayed zKill checks';
 return <Dialog open={!!id} onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="session-report-dialog session-v2"><DialogHeader><p className="eyebrow">KAIRO / FLIGHT RECORD</p><DialogTitle>Session overview</DialogTitle><DialogDescription>{report?pilot+' · '+stamp(report.session.started)+' → '+(report.session.ended?stamp(report.session.ended):'In progress'):'Loading your session…'}</DialogDescription></DialogHeader>
  {error&&<p role="alert" className="inline-error">{error}</p>}
  {report&&<div className="stack">
   <div className="report-title"><label className="field-label flex-1">Session name<Input value={name} onChange={e=>setName(e.target.value)} maxLength={100}/></label><span className={'tag '+(!report.session.ended?'positive':'')}>{report.session.ended?'COMPLETE':'ACTIVE'}</span></div>
   <section className="session-summary" aria-labelledby={summaryId}>
    <div className="session-summary-heading"><div><h2 id={summaryId}><Clock size={19}/> Session summary</h2><p className="session-collection-status">{collectionLabel}</p></div><Button size="sm" variant="outline" disabled={refreshing} onClick={refreshReport}><RefreshCw size={14} className={refreshing?'animate-spin':''}/> Refresh</Button></div>
    <div className="session-summary-grid">
     <div className="session-summary-stat" data-summary="duration"><Metric label="Duration" value={duration(report.durationSeconds)}/><p>{number(s.events)} recorded events</p></div>
     <div className="session-summary-stat" data-summary="travel"><Metric label="Systems visited" value={s.systems}/><p>{report.route.length} visits · {report.ships.hulls.length} hull types</p></div>
     <div className="session-summary-stat" data-summary="personal"><Metric label="Personal kills / losses" value={<><span className="positive">{s.kills}</span><span className="session-summary-separator">/</span><span className="negative">{s.losses}</span></>}/><p>{valueLabel(personal.destroyed,personal.missingDestroyed)} destroyed</p></div>
     <div className="session-summary-stat" data-summary="alliance"><Metric label="Alliance kills / losses" value={alliance.allianceId?<><span className="positive">{alliance.kills}</span><span className="session-summary-separator">/</span><span className="negative">{alliance.losses}</span></>:'—'}/><p>{coverageLabels[alliance.coverage.status]||alliance.coverage.status}</p></div>
     <div className="session-summary-stat" data-summary="wallet"><Metric label="Wallet change" value={s.walletDelta===null?'Not recorded':(s.walletDelta>0?'+':'')+isk(s.walletDelta,true)} unit={s.walletDelta===null?undefined:'ISK'} state={s.walletDelta===null} tone={s.walletDelta<0?'negative':s.walletDelta>0?'positive':''}/><p>{s.walletDelta===null?'Balance samples incomplete':'Saved balance comparison'}</p></div>
     <div className="session-summary-stat" data-summary="loyalty"><Metric label="LP balance change" value={lpHeadline} unit={lpIsState?undefined:'LP'} state={lpIsState} tone={lpIsState?'':lp.delta<0?'negative':lp.delta>0?'positive':''}/><p>{lpStatus}</p></div>
    </div>
    <div className="session-summary-activity"><MapPin size={22}/>{activity?<><span><small>{activity.measure==='combat'?'Most active system':'Most time observed'}</small><strong>{activity.name}</strong></span><span className="session-summary-basis"><b>{activity.measure==='combat'?number(activity.killmails)+' recorded '+(activity.killmails===1?'killmail':'killmails'):duration(activity.seconds)}</b><small>{activity.measure==='combat'?'Personal + alliance in this system':'Across all observed visits'}</small></span></>:<p>No system activity recorded yet.</p>}</div>
   </section>
   <div className="session-section-heading"><h2>Session activity</h2><p>Choose a card to explore the full record.</p></div>
   <ReportGrid>
    <ReportCard cardId="route" tone="travel" status={report.route.length+' visits · '+s.systems+' systems'} icon={MapPin} title="Route & visits" subtitle="Every observed visit, in order" preview={<><span className="session-metric-pair"><Metric label="Systems" value={s.systems}/><Metric label="Visits" value={report.route.length}/></span><span className="session-route-preview">{!report.route.length&&<span className="session-coverage-line">No location observations recorded.</span>}{report.route.slice(0,6).map((v:any,i:number)=><span key={v.id}>{i>0&&<ArrowRight size={11}/>}<span>{v.name}</span></span>)}{report.route.length>6&&<small>+{report.route.length-6} visits</small>}</span></>}>
     <p className="meta">All visits are kept. The ±10m badge only marks visits whose alliance combat window receives the extra buffer. Times come from observed location samples; fast transits and travel while Kairo is closed may be missed.</p>
     {report.route.length?<RouteVisits route={report.route}/>:<p className="meta">No location observations were captured for this session.</p>}
    </ReportCard>
    <ReportCard cardId="ships" tone="travel" status={report.ships.initialRecorded?'Starting ship recorded':'Starting ship not recorded'} icon={Ship} title="Ships flown" subtitle="Hull history & changes" preview={<><span className="session-metric-pair"><Metric label="Hull types" value={report.ships.hulls.length}/><Metric label="Ship changes" value={s.shipChanges}/></span><span className="session-hull-preview">{!report.ships.hulls.length&&<span className="session-coverage-line">No hull observations recorded.</span>}{report.ships.hulls.slice(0,4).map((h:any)=><span key={h.typeId}><img loading="lazy" width={40} height={40} src={'https://images.evetech.net/types/'+h.typeId+'/icon?size=64'} alt=""/><span>{h.name}</span></span>)}</span></>}>
     {!report.ships.initialRecorded&&<p className="meta">The starting ship was not captured; the list begins with the first recorded ship change.</p>}
     <div className="session-hulls">{report.ships.hulls.map((h:any)=><div key={h.typeId}><img loading="lazy" width={64} height={64} src={'https://images.evetech.net/types/'+h.typeId+'/icon?size=64'} alt=""/><span><strong>{h.name}</strong><small>{duration(h.seconds)} observed · {h.stints} {h.stints===1?'stint':'stints'}</small></span></div>)}</div>
     <ol className="session-ship-changes">{report.ships.changes.map((h:any,i:number)=><li key={i}><time>{stamp(h.at)}</time><span>{h.name}</span><small>{duration(h.seconds)}</small></li>)}</ol>
    </ReportCard>
    <ReportCard cardId="personal" tone="combat" status="Your pilot’s participation" icon={Swords} title="Personal combat" subtitle="Your recorded participation & losses" preview={<><span className="session-metric-pair"><Metric label="Kills" value={s.kills} tone="positive"/><Metric label="Losses" value={s.losses} tone="negative"/></span><span className="session-value-line"><span>Destroyed <b>{valueLabel(personal.destroyed,personal.missingDestroyed)}</b></span><span>Lost <b>{valueLabel(personal.lost,personal.missingLost)}</b></span></span></>}>
     <CombatCoverage coverage={report.combatCoverage} sessionPhase={phase}/><p className="meta">Values use zKillboard totalValue estimates for the recorded killmails. Missing prices remain unpriced. Personal counts use the session’s own start/end times.</p><KillList items={personal.items} names={report.names}/>
    </ReportCard>
    <ReportCard cardId="alliance" tone="combat" status={coverageLabels[alliance.coverage.status]||alliance.coverage.status} icon={Shield} title="Alliance combat" subtitle={alliance.name||coverageLabels[alliance.coverage.status]||'Alliance context'} preview={<><span className="session-metric-pair"><Metric label="Kills" value={alliance.allianceId?alliance.kills:'—'} tone="positive"/><Metric label="Losses" value={alliance.allianceId?alliance.losses:'—'} tone="negative"/></span><span className="session-value-line"><span>Destroyed <b>{alliance.allianceId?valueLabel(alliance.destroyed,alliance.missingDestroyed):'Not recorded'}</b></span><span>Lost <b>{alliance.allianceId?valueLabel(alliance.lost,alliance.missingLost):'Not recorded'}</b></span></span><span className="session-coverage-line">{alliance.allianceId?alliance.combatVisits+' visits qualify for a ±10m combat window':'A historical alliance baseline is needed for these totals.'}</span></>}>
     <p className="meta">Alliance kills and losses in each visited system qualify its visit for a buffer only when at least one happens while you are there. Qualified windows extend ten minutes before entry and after exit. Overlapping windows merge, and each killmail is counted once as either a kill or a loss.</p>
     <p className="meta">{alliance.allianceId?'Uses the alliance recorded at session start: '+(alliance.name||alliance.allianceId)+'.':'A current alliance sample was not available when this session began.'} An alliance member’s ship is always a loss, even when friendly attackers appear on its killmail. Other victims count as kills only when your alliance is among the attackers. Your own participation remains included in these alliance totals.</p>
     {alliance.coverage.detail&&<p className="meta">{alliance.coverage.detail}</p>}{alliance.coverage.error&&<p className="inline-error">{alliance.coverage.error}</p>}
     {alliance.coverage.updatedAt&&<p className="meta">Last history check: {stamp(alliance.coverage.updatedAt)}{phase!=='static'&&alliance.coverage.retryAt?' · next history check: '+stamp(alliance.coverage.retryAt):''}</p>}
     {phase==='live'&&<p className="meta">Live feed: {feed?.status==='error'?'retry pending':feed?.status==='catching_up'?'catching up with published records':feed?.checkedAt?'latest published records checked':'waiting for first check'}{feed?.checkedAt?' · checked '+stamp(feed.checkedAt):''}{feed?.nextCheckAt?' · next check '+stamp(feed.nextCheckAt):''}. The incremental feed checks about every two minutes while this session is live, subject to source availability and cooldowns.</p>}
     {phase==='live'&&feed?.error&&<p className="inline-error">{feed.error}</p>}
     <p className="meta">{phase==='static'?'This session is archived. Its zKill collection window has closed; opening or refreshing it reads saved records without restarting collection.':phase==='settling'?'The live feed has stopped for this session. Pending and delayed history checks continue until '+stamp(report.collection.until)+', subject to source cache deadlines.':'Public history checks also collect earlier and delayed killmails.'} Unpublished records and unpriced values remain outside the available totals.</p>
     {!!alliance.windows.length&&<details className="session-window-detail"><summary>Included combat windows ({alliance.windows.length})</summary>{alliance.windows.map((w:any,i:number)=><p key={i}><strong>{w.name}</strong><br/>{stamp(w.from)} → {stamp(w.to)}<br/>{w.visitIds.length} qualifying {w.visitIds.length===1?'visit':'visits'}</p>)}</details>}
     <KillList items={alliance.items} names={report.names} alliance/>
    </ReportCard>
    <ReportCard cardId="loyalty" tone="economy" status={lpStatus} icon={Coins} title="Loyalty points" subtitle="Personal balance changes by NPC corporation" preview={<><span className="session-metric-pair"><Metric label="Net balance change" value={lpHeadline} unit={lpIsState?undefined:'LP'} state={lpIsState} tone={lpIsState?'':lp.delta<0?'negative':lp.delta>0?'positive':''}/><Metric label="Corporations" value={lp.status==='unavailable'?'—':lp.rows.length}/></span><span className="session-coverage-line">{lp.startSampledAt?'Start sample · '+stamp(lp.startSampledAt):'This session has no recorded LP baseline.'}</span></>}>
     <p className="meta">LP is your character’s balance change, including LP earned, spent or donated. ESI supplies balances, so this is not a gross earnings ledger.</p>
     {lp.status==='unavailable'&&<p className="meta">LP needs the combat module and the esi-characters.read_loyalty.v1 permission. Enable or reconnect it in Connections before starting your next session. Missing historical samples cannot be reconstructed.</p>}
     {lp.status==='pending'&&<p className="meta">ESI may still be serving a cached balance. Kairo retains these samples and waits for the first fresh balance after the session ends.</p>}
     {lp.status==='delayed'&&<p className="meta">The end balance was reconciled using a later sample. Its change can include activity after the session; treat it as an estimate.</p>}
     {lp.status==='overlap'&&<p className="meta">A later session started before a fresh end balance arrived. Kairo kept the original samples to avoid crediting the same LP to both sessions. An exact session change is unavailable.</p>}
     {lp.startSampledAt&&<p className="meta">Samples: {stamp(lp.startSampledAt)} → {lp.endSampledAt?stamp(lp.endSampledAt):'Not recorded'}</p>}
     {lp.rows.length>0&&<div className="session-table-wrap"><table className="session-lp-table"><thead><tr><th>NPC corporation</th><th>Start</th><th>End</th><th>Change</th></tr></thead><tbody>{lp.rows.map((r:any)=><tr key={r.corporationId}><td>{r.name}</td><td data-label="Start">{number(r.start)}</td><td data-label="End">{number(r.end)}</td><td data-label="Change" className={r.delta<0?'negative':r.delta>0?'positive':''}>{signed(r.delta)}</td></tr>)}</tbody></table></div>}
    </ReportCard>
    <ReportCard cardId="wallet" tone="economy" status={s.walletDelta===null?'Balance samples incomplete':'Saved balance comparison'} icon={Wallet} title="Wallet activity" subtitle="Observed inflows, outflows & balance" preview={<><span className="session-metric-pair"><Metric label="Wallet change" value={s.walletDelta===null?'Not recorded':(s.walletDelta>0?'+':'')+isk(s.walletDelta,true)} unit={s.walletDelta===null?undefined:'ISK'} state={s.walletDelta===null} tone={s.walletDelta<0?'negative':s.walletDelta>0?'positive':''}/></span><span className="session-value-line"><span>In <b className="positive">+{isk(s.income,true)} ISK</b></span><span>Out <b className="negative">−{isk(s.expenses,true)} ISK</b></span></span></>}>
     <p className="meta">Inflows and outflows come from journal entries in this session’s time window. The wallet comparison uses saved balance samples and includes transfers and market activity.</p><p className="meta">Samples: {report.start.wallet?.sampledAt?stamp(report.start.wallet.sampledAt):'No start sample'} → {report.finish.wallet?.sampledAt?stamp(report.finish.wallet.sampledAt):'No end sample'}</p>
    </ReportCard>
    <ReportCard cardId="progress" tone="activity" status="Skills · industry · goals" icon={BookOpen} title="Progress & milestones" subtitle="Training, industry & goals" preview={<span className="session-metric-pair"><Metric label="Skill levels" value={s.skillLevels}/><Metric label="Jobs ready" value={s.jobs}/><Metric label="Goals complete" value={s.goals}/></span>}>
     <p className="meta">{s.skillpointDelta===null?'Skill-point comparison unavailable.':signed(s.skillpointDelta)+' SP between the available samples.'}</p><p className="meta">Recorded skill completions, industry jobs becoming ready and completed goals also appear in the timeline below.</p>
    </ReportCard>
    <ReportCard cardId="coverage" tone="activity" status="Observed data & timing" icon={Flag} title="Coverage & timing" subtitle="What Kairo was able to observe" preview={<span className="session-metric-pair"><Metric label="Recorded events" value={s.events}/><Metric label="Session duration" value={duration(report.durationSeconds)}/></span>}>
     <p className="meta">{collectionLabel}.{phase==='settling'?' Rechecks finish '+stamp(report.collection.until)+'.':''} Reports follow occurrence times. Disabled modules, missing permissions, API caches and time with Kairo closed limit coverage.</p><div className="session-coverage-tags">{Object.entries(report.finish.coverage||{}).map(([key,value])=><span className="tag" key={key}>{key}: {String(value).replaceAll('_',' ')}</span>)}</div>{!report.start.capturedAt&&<p className="meta">This session predates detailed capture. Saved events and visits remain available, but missing start/end samples cannot be recreated.</p>}
    </ReportCard>
    <ReportCard cardId="timeline" tone="activity" status={report.events.length+' of '+s.events+' events shown'} icon={Activity} title="Activity timeline" subtitle="The session, event by event" wide preview={<span className="session-timeline-preview"><strong>{s.events} recorded events</strong><span>{report.events[0]?.summary||'No events recorded yet'}</span></span>}>
     <div className="report-events">{report.events.map((e:any)=><article key={e.id}><time>{stamp(e.at)}</time><span className={'event-dot '+e.module}/><div><strong>{e.summary}</strong><small>{e.type.replaceAll('.',' / ').replaceAll('_',' ')}</small></div></article>)}</div>{report.more&&<Button variant="outline" className="mt-4" disabled={loadingMore} onClick={moreEvents}>{loadingMore?'Loading…':'Load more session events'}</Button>}
    </ReportCard>
   </ReportGrid>
   <div className="session-debrief"><label className="field-label">Debrief & notes<Textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} maxLength={12000} placeholder="What went well? What should you prepare for next time?"/></label><Button disabled={busy||!name.trim()} onClick={save}><Save size={15}/> {busy?'Saving…':'Save session details'}</Button></div>
  </div>}
 </DialogContent></Dialog>;
}
