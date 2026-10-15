import { randomUUID } from 'node:crypto';
import {bindingKinds,toastContexts,renderToast} from './projections.mjs';
import {sseEvent, writeSSE, closeSSE} from './sse.mjs';
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
    const clients = new Set(), last = new Map(), timers = new Map();
    let version = 0, closed = false, closing, bindingKey = '{}';
    let opsec = { state: 'unknown', hidden: true, reason: 'Awaiting verified context.' };
    let bindings = {};
    let notifications = [];
    function retainNotifications(next) {
        // Timer closures own the event too. Release discarded notifications
        // immediately, keeping scheduled work within the same ten-toast bound.
        const retained = new Set(next);
        for (const [notification, timer] of timers) if (!retained.has(notification)) {
            clearTimeout(timer); timers.delete(notification);
        }
        notifications = next;
    }
    const config = () => sanitizeConfig(store.get('stream', defaultStream()));
    function outputToast(n) {const rule=config().rules.find(r=>r.event===n.event.type)||n.rule;return {id:n.id,signal:signalFor(n.event.type),...renderToast(store,n.event,rule,opsec,n.test),duration:n.rule.duration,sound:rule.sound&&!config().muted,showAt:n.showAt,expiresAt:n.expiresAt};}
    function state() {const c=config();return {version,serverTime:Date.now(),position:c.position,muted:c.muted,paused:c.paused,elements:c.elements.filter(e=>e.visible).map(e=>{const {binding,sourceId,characterId,bindingDisplay,name,...visual}=e;return {...visual,...(binding&&binding!=='none'?bindings[e.id]||bindings[binding]||{text:'Source unavailable',value:0,endsAt:0,detail:'',bindingStatus:'unavailable'}:{})};}),opsec:{state:opsec.state,hidden:opsec.hidden},toasts:notifications.filter(n=>n.showAt<=Date.now()&&n.expiresAt>Date.now()).map(outputToast)};}
    function broadcast(type = 'state', data, options) {
        if (closed || !clients.size) return;
        const message = sseEvent(type, data ?? state());
        for (const client of clients) if (!writeSSE(client, message, options)) clients.delete(client);
    }
    function changed(requireImmediate = false) { if (closed) return; version++; broadcast('state', undefined, {requireImmediate}); }
    function save(c, nextBindings) { if (closed) throw new Error('Stream is stopping.'); const normalized = sanitizeConfig(c); store.set('stream', normalized); if(nextBindings) {bindings=nextBindings;bindingKey=JSON.stringify(nextBindings);} retainNotifications(notifications.filter(n=>normalized.rules.some(r=>r.event===n.event.type&&(n.test||r.enabled&&(!r.characterId||r.characterId===n.event.characterId))))); if (normalized.paused) {
        retainNotifications([]);
    } changed(); return normalized; }
    function emit(input,test=false){if(closed)return false;const event=typeof input==='string'?{type:input,payload:{}}:input,c=config(),rule=c.rules.find(r=>r.event===event.type);if(!rule||(!test&&!rule.enabled)||c.paused||(!test&&rule.characterId&&rule.characterId!==event.characterId))return false;const key=event.type+':'+(event.characterId||0);if(!test&&Date.now()-(last.get(key)||0)<rule.cooldown*1000)return false;last.set(key,Date.now());const n={id:randomUUID(),event,rule,test,showAt:Date.now()+rule.delay*1000,expiresAt:Date.now()+(rule.delay+rule.duration)*1000};retainNotifications(notifications.filter(x=>x.expiresAt>Date.now()).slice(-9));notifications.push(n);const t=setTimeout(()=>{timers.delete(n);if(!closed&&!config().paused&&notifications.includes(n))broadcast('toast',outputToast(n));},rule.delay*1000);timers.set(n,t);return true;}
    const unsubscribe = bus.on('*',e=>{if(!e.historical&&eventTemplates.some(t=>t[0]===e.type))emit(e);});
    return { config, state, save, emit, clients, changed, getOPSEC: () => opsec, setOPSEC(next) { if (closed) return; const old = opsec; opsec = next; if (old.state !== next.state || old.hidden !== next.hidden) {
            changed(next.hidden && !old.hidden);
            publish({type:'opsec.changed',module:'opsec',characterId:next.characterId,summary:'Broadcast protection: '+old.state+' → '+next.state,payload:{state:next.state,previous:old.state,reason:next.reason}});
        } }, setBindings(next) { if (closed) return; const key=JSON.stringify(next); bindings=next; if(key===bindingKey)return; bindingKey=key; changed(); }, connect(res) { if (closed) {res.end();return;} clients.add(res); res.on('close', () => clients.delete(res)); if(!writeSSE(res,sseEvent('state',state())))clients.delete(res); }, close() { if(closed)return closing;closed=true;unsubscribe();retainNotifications([]);last.clear();bindings={};closing=Promise.all([...clients].map(closeSSE));clients.clear();return closing; } };
}
