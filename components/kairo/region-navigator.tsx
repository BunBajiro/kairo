"use client";
import {useState} from 'react';
import {Layers,MapPin,Search,ChevronDown} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
export function RegionNavigator({regions,total,value,onChange}:{regions:any[];total:number;value:string;onChange:(v:string)=>void}){
 const [expanded,setExpanded]=useState(false),[query,setQuery]=useState('');
 const current=regions.find(r=>r.id===value),visible=regions.filter(r=>r.name.toLowerCase().includes(query.toLowerCase()));
 const shortlist=regions.slice(0,4);if(current&&!shortlist.some(r=>r.id===value))shortlist[3]=current;
 return <section className="region-navigator" aria-label="Explored regions"><div className="region-nav-heading"><div><span className="eyebrow">REGION ATLAS</span><p>{current?current.name:'Across New Eden'} <span>· {current?current.count:total} systems</span></p></div><Button variant="ghost" size="sm" aria-expanded={expanded} aria-controls="region-directory" onClick={()=>setExpanded(!expanded)}>{expanded?'Close atlas':'Explore '+regions.length+' regions'}<ChevronDown size={15} className={expanded?'rotate-180':''}/></Button></div>
 <div className="region-shortlist"><button aria-pressed={value==='all'} onClick={()=>onChange('all')}><Layers size={15}/><span>All regions</span><b>{total}</b></button>{shortlist.map(r=><button key={r.id} aria-pressed={value===r.id} onClick={()=>onChange(r.id)}><MapPin size={15}/><span>{r.name}</span><b>{r.count}</b></button>)}</div>
 {expanded&&<div id="region-directory" className="region-directory"><div className="search-field"><Search size={15}/><Input aria-label="Search explored regions" placeholder="Find an explored region…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="region-directory-grid">{visible.map(r=><button key={r.id} aria-pressed={value===r.id} onClick={()=>{onChange(r.id);setExpanded(false);}}><strong>{r.name}</strong><span>{r.count} systems · {r.visits} visits</span><i style={{width:Math.max(3,r.count/Math.max(total,1)*100)+'%'}}/></button>)}{!visible.length&&<p className="meta">No explored regions match.</p>}</div></div>}
 </section>;
}
