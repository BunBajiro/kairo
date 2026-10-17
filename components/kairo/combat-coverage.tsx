"use client";
/**
 * Shared explanation of personal killmail evidence in operation and Session views.
 * Coverage describes collected public evidence, not complete fleet participation;
 * the runtime owns collection deadlines. See ../../docs/SESSIONS.md.
 */
import {stamp} from './model';
const labels:Record<string,string>={ready:'Collected',partial:'Collecting remaining records',waiting:'Waiting for first collection',stale:'Retrying public source',error:'Public source unavailable',disabled:'Paused'};
export function CombatCoverage({coverage,sessionPhase}:{coverage:any;sessionPhase?:string}){
 return <div className="combat-coverage"><p><strong>Every recorded participant counts.</strong> Kairo credits your pilot wherever they appear among a killmail’s attackers, including EWAR; the final blow is optional.</p><span className="meta">ESI + public zKillboard · {labels[coverage?.status]||'Waiting for first collection'}{coverage?.updatedAt?' · checked '+stamp(coverage.updatedAt):''}{!sessionPhase&&coverage?.expiresAt?' · next refresh '+stamp(coverage.retryAt||coverage.expiresAt):''}</span>{coverage?.error&&<p className="meta negative">{coverage.error}</p>}<details className="mt-3"><summary className="text-link">Coverage & delayed records</summary><p>ESI supplies your losses and final blows. zKillboard fills in published participation records. Its history search withholds the newest five minutes and caches responses for at least an hour. Live sessions also check the incremental feed about every two minutes. Session history checks continue after ending and stop after 24 hours.</p><p>Unpublished killmails and fleet members absent from the attacker list cannot be counted from these sources. Kairo only reads public records and never uploads your private killmails.</p></details></div>;
}
