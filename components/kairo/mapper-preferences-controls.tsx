"use client";

/** Mapper display settings shared across a pilot's maps on this device, independent of backend records. */
import {useEffect,useState} from 'react';
import {useKairo} from './context';
import {MAPPER_PREFERENCES_EVENT,mapperPreferencesKey,normalizeMapperPreferences,readMapperPreferences,type MapperPreferences} from './mapper-preferences.mjs';

/** Normalize immediate local saves and reconcile other consumers; pilot switches cannot expose prior preferences. */
export function useMapperPreferences(character:number) {
  const read=()=>{try{return readMapperPreferences(character,window.localStorage);}catch{return normalizeMapperPreferences(null);}};
  const [state,setState]=useState(()=>({character,value:read()}));
  useEffect(()=>{const load=()=>setState({character,value:read()});load();window.addEventListener('storage',load);window.addEventListener(MAPPER_PREFERENCES_EVENT,load);return()=>{window.removeEventListener('storage',load);window.removeEventListener(MAPPER_PREFERENCES_EVENT,load);};},[character]);
  const preferences=state.character===character?state.value:normalizeMapperPreferences(null);
  const update=(patch:Partial<MapperPreferences>)=>{const value=normalizeMapperPreferences({...preferences,...patch});setState({character,value});try{localStorage.setItem(mapperPreferencesKey(character),JSON.stringify(value));window.dispatchEvent(new Event(MAPPER_PREFERENCES_EVENT));}catch{}};
  return [preferences,update] as const;
}
export function MapperScaleControls({preferences,onChange}:{preferences:MapperPreferences;onChange:(patch:Partial<MapperPreferences>)=>void}) {
  return <>{([{key:'knownScale',label:'K-space node size'},{key:'wormholeScale',label:'J-space node size'}] as const).map(({key,label})=><label key={key} className="mapper-scale"><span>{label}</span><input aria-label={label} type="range" min=".5" max="1.5" step=".05" value={preferences[key]} onChange={event=>onChange({[key]:Number(event.target.value)})}/><output>{Math.round(preferences[key]*100)}%</output></label>)}</>;
}
export function MapperPreferencesPanel() {
  const {character}=useKairo(),[preferences,update]=useMapperPreferences(character);
  return <section className="panel mapper-preferences" aria-label="Mapper preferences"><h2>Mapper preferences</h2><p className="meta">Map display choices for this pilot on this device. Changes are saved immediately.</p><MapperScaleControls preferences={preferences} onChange={update}/><label className="mapper-focus"><input type="checkbox" checked={preferences.focusDetail} onChange={event=>update({focusDetail:event.target.checked})}/><span><strong>Focus-based map detail</strong><small>Keep selected systems and the settled centre of your view in full detail. Make surrounding systems smaller and quieter after you finish moving the map.</small></span></label><p className="meta">Create region, constellation or custom groups from the Display controls on a map. Entry and exit systems remain visible when a group is collapsed.</p></section>;
}
