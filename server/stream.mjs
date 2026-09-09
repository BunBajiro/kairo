import { randomUUID } from 'node:crypto';
import {bindingKinds,toastContexts,renderToast} from './projections.mjs';
const signalFor = type => ({'skill.completed':'training','industry.ready':'industry','goal.completed':'objective','session.started':'session','session.ended':'session','killmail.kill':'kill','killmail.loss':'loss','location.changed':'navigation','opsec.changed':'protection'}[type] || 'notification');
export const eventTemplates = Object.entries(toastContexts).map(([event,c])=>[event,c.title,c.message]);
export const defaultStream = () => ({ elements: [], rules: eventTemplates.map(([event, title, message]) => ({ event, title, message, enabled: false, duration: 6, cooldown: 30, delay: 0, sound: false })), position: 'top-right', muted: false, paused: false });
const num = (n, min, max, def) => Number.isFinite(Number(n)) ? Math.min(max, Math.max(min, Number(n))) : def;
const str = (s, max = 200) => String(s ?? '').slice(0, max);
export const kinds = ['panel', 'text', 'countdown', 'clock', 'progress', 'goal', 'opsec', 'divider', 'lower-third'];
export function sanitizeConfig(input) {
    if (!input || !Array.isArray(input.elements) || input.elements.length > 50 || !Array.isArray(input.rules))
        throw new Error('Invalid stream configuration.');
    return { elements: input.elements.map(e => ({ id: /^[\w-]{1,80}$/.test(e.id) ? e.id : randomUUID(), kind: kinds.includes(e.kind) ? e.kind : 'panel', appearance: e.appearance === 'minimal' ? 'minimal' : 'frame', name: str(e.name, 80), text: str(e.text, 500), label: str(e.label, 100), x: num(e.x, 0, 1910, 40), y: num(e.y, 0, 1070, 40), width: num(e.width, 10, 1920, 400), height: num(e.height, 4, 1080, 120), fontSize: num(e.fontSize, 12, 120, 24), opacity: e.kind === 'opsec' ? 1 : num(e.opacity, 0, 1, .7), color: /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : '#97ebce', visible: e.visible === true, endsAt: e.kind === 'countdown' ? num(e.endsAt, 0, Date.now() + 31536000000, 0) : 0, value: num(e.value, 0, 100, 0), binding: !['opsec','divider','clock'].includes(e.kind) && bindingKinds.includes(e.binding) ? e.binding : 'none', sourceId: str(e.sourceId,80), characterId: Number.isSafeInteger(e.characterId) && e.characterId>=0 ? e.characterId : undefined, bindingDisplay: ['title','numbers','both'].includes(e.bindingDisplay) ? e.bindingDisplay : 'both' })), rules: eventTemplates.map(([event, title, message]) => { const r = input.rules.find(r => r.event === event) || {}; return { event, title: str(r.title || title, 100), message: str(r.message || message, 240), enabled: r.enabled === true, duration: num(r.duration, 2, 30, 6), cooldown: num(r.cooldown, 0, 3600, 30), delay: num(r.delay, 0, 600, 0), sound: r.sound === true, characterId: Number.isSafeInteger(r.characterId) && r.characterId>0 ? r.characterId : 0, allowLocation: r.allowLocation === true }; }), position: ['top-right', 'top-left', 'bottom-right', 'bottom-left'].includes(input.position) ? input.position : 'top-right', muted: input.muted === true, paused: input.paused === true };
}
export { classifyOPSEC } from './opsec.mjs';
export function createStream(store, bus, publish = e=>bus.emit(e)) {
    const clients = new Set(), last = new Map(), timers = new Set();
    let version = 0;
    let opsec = { state: 'unknown', hidden: true, reason: 'Awaiting verified context.' };
    let bindings = {};
    let notifications = [];
    const config = () => sanitizeConfig(store.get('stream', defaultStream()));
    function outputToast(n) {const rule=config().rules.find(r=>r.event===n.event.type)||n.rule;return {id:n.id,signal:signalFor(n.event.type),...renderToast(store,n.event,rule,opsec,n.test),duration:n.rule.duration,sound:rule.sound&&!config().muted,showAt:n.showAt,expiresAt:n.expiresAt};}
    function state() {const c=config();return {version,serverTime:Date.now(),position:c.position,muted:c.muted,paused:c.paused,elements:c.elements.filter(e=>e.visible).map(e=>{const {binding,sourceId,characterId,bindingDisplay,name,...visual}=e;return {...visual,...(binding&&binding!=='none'?bindings[e.id]||bindings[binding]||{text:'Source unavailable',value:0,endsAt:0,detail:'',bindingStatus:'unavailable'}:{})};}),opsec:{state:opsec.state,hidden:opsec.hidden},toasts:notifications.filter(n=>n.showAt<=Date.now()&&n.expiresAt>Date.now()).map(outputToast)};}
    function broadcast(type = 'state', data = state()) { for (const c of clients) {
        if (c.destroyed || c.writableLength > 1000000) {
            c.destroy();
            clients.delete(c);
            continue;
        }
        c.write('event: ' + type + '\ndata: ' + JSON.stringify(data) + '\n\n');
    } }
    function changed() { version++; broadcast(); }
    function save(c, nextBindings) { const normalized = sanitizeConfig(c); if(nextBindings) bindings=nextBindings; store.set('stream', normalized); notifications=notifications.filter(n=>normalized.rules.some(r=>r.event===n.event.type&&(n.test||r.enabled))); if (normalized.paused) {
        notifications = [];
        for (const t of timers)
            clearTimeout(t);
        timers.clear();
    } changed(); return normalized; }
    function emit(input,test=false){const event=typeof input==='string'?{type:input,payload:{}}:input,c=config(),rule=c.rules.find(r=>r.event===event.type);if(!rule||(!test&&!rule.enabled)||c.paused||(!test&&rule.characterId&&rule.characterId!==event.characterId))return false;const key=event.type+':'+(event.characterId||0);if(!test&&Date.now()-(last.get(key)||0)<rule.cooldown*1000)return false;last.set(key,Date.now());const n={id:randomUUID(),event,rule,test,showAt:Date.now()+rule.delay*1000,expiresAt:Date.now()+(rule.delay+rule.duration)*1000};notifications=notifications.filter(x=>x.expiresAt>Date.now()).slice(-9);notifications.push(n);const t=setTimeout(()=>{timers.delete(t);if(!config().paused&&notifications.includes(n))broadcast('toast',outputToast(n));},rule.delay*1000);timers.add(t);return true;}
    bus.on('*',e=>{if(!e.historical&&eventTemplates.some(t=>t[0]===e.type))emit(e);});
    return { config, state, save, emit, clients, changed, getOPSEC: () => opsec, setOPSEC(next) { const old = opsec; opsec = next; if (old.state !== next.state || old.hidden !== next.hidden) {
            changed();
            publish({type:'opsec.changed',module:'opsec',characterId:next.characterId,summary:'Broadcast protection: '+old.state+' → '+next.state,payload:{state:next.state,previous:old.state,reason:next.reason}});
        } }, setBindings(next) { bindings = next; changed(); }, connect(res) { clients.add(res); res.write('event: state\ndata: ' + JSON.stringify(state()) + '\n\n'); res.on('close', () => clients.delete(res)); }, close() { for (const t of timers)
            clearTimeout(t); for (const c of clients)
            c.end(); } };
}
