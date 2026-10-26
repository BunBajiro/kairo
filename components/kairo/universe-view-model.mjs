/** Normalize local workspace restores and server-saved views to the currently supported Atlas controls. */
import {universeTabForSpace} from './workspace-navigation.mjs';

export const DEFAULT_UNIVERSE_VIEW = Object.freeze({background:'power_blocs',indicator:'none',space:'known',region:'all',standingFilter:'all',showConnections:true,showSpecialLinks:true});
const backgrounds = new Set(['power_blocs','sovereignty','standings','security','activity','none']);
const indicators = new Set(['none','ship_kills','pod_kills','npc_kills','npc_delta','adm','jumps','mining','industry','fw','incursions']);

/** Named saved views and workspace restores share the same supported layer contract. */
export function restoreUniverseView(config) {
 return {
  background:backgrounds.has(config?.background)?config.background:DEFAULT_UNIVERSE_VIEW.background,
  indicator:indicators.has(config?.indicator)?config.indicator:DEFAULT_UNIVERSE_VIEW.indicator,
  space:config?.space==='wormhole'?'wormhole':'known',
  region:config?.space==='wormhole'?'all':config?.region==='all'||/^\d+$/.test(String(config?.region))?String(config.region):'all',
  standingFilter:['all','friendly','hostile','neutral','unknown'].includes(config?.standingFilter)?config.standingFilter:'all',
  showConnections:typeof config?.showConnections==='boolean'?config.showConnections:true,
  showSpecialLinks:typeof config?.showSpecialLinks==='boolean'?config.showSpecialLinks:true,
 };
}

/** Retired footprint views become a custom view without discarding other choices. */
export function restoreUniverseWorkspace(saved, space) {
 const fallback = {tab:'atlas',view:{...DEFAULT_UNIVERSE_VIEW,space,background:space==='wormhole'?'security':DEFAULT_UNIVERSE_VIEW.background},preset:space==='wormhole'?'exploration':'political',selected:null,inspector:'system',inspectorOpen:space!=='wormhole',routeDraft:{from:'',to:''},navigationTool:'gate'};
 if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return fallback;
 const view = restoreUniverseView(saved.view);
 return {...fallback,
  tab:universeTabForSpace(space,saved.tab),view:{...view,space,region:space==='wormhole'?'all':view.region},
  preset:saved.preset==='journey'?'custom':typeof saved.preset==='string'?saved.preset:fallback.preset,
  selected:space==='wormhole'?null:Number.isSafeInteger(saved.selected)?saved.selected:null,
  inspector:['system','blocs','route','jump','intel','explore'].includes(saved.inspector)?saved.inspector:'system',
  inspectorOpen:space==='wormhole'?false:typeof saved.inspectorOpen==='boolean'?saved.inspectorOpen:fallback.inspectorOpen,
  routeDraft:{from:String(saved.routeDraft?.from||'').slice(0,100),to:String(saved.routeDraft?.to||'').slice(0,100)},
  navigationTool:['gate','jump','range'].includes(saved.navigationTool)?saved.navigationTool:fallback.navigationTool,
 };
}
