import {createScopedRefresh} from './scoped-refresh.mjs';

// Progress, private notes and creation choices have independent invalidations.
// A pilot owns these readers; disposing it fences every pending publication.
/**
 * Own progress, notes and source-choice reads for one fixed numeric pilot ID.
 * Source metadata loads once, then only while its editor is visible unless forced.
 * progress also invalidates metadata; it never refreshes private notes. refresh,
 * notes and metadata force explicit reads; resume releases visibility-held work.
 * Close when the pilot/view retires. Errors use onError, not rejected drain waiters.
 */
export function createGoalResourceReads({character, read, publishGoals, publishNotes, publishSources,
    visible = () => true, metadataVisible = () => false, onError}) {
    const query = '?character=' + character;
    let initialSources = true;
    const goals = createScopedRefresh({read: () => read('/goals' + query), publish: publishGoals, canRead: visible, onError});
    const notes = createScopedRefresh({read: () => read('/notes' + query), publish: publishNotes, canRead: visible, onError});
    const sources = createScopedRefresh({read: () => read('/goals/sources' + query),
        publish: value => {initialSources = false; publishSources(value);},
        canRead: () => visible() && (initialSources || metadataVisible()), onError});
    const metadata = () => {void sources.request();};
    const progress = () => {metadata(); return goals.request();};
    const recovery = () => {void progress(); void notes.request();};
    return {
        initial: recovery, progress, notes: () => notes.request({force: true}),
        metadata() {return sources.request({force: true});},
        refresh() {return Promise.all([goals.request({force: true}), notes.request({force: true}), sources.request({force: true})]).then(() => {});},
        changed(detail = {}) {
            if (detail.characterId && detail.characterId !== character) return;
            if (!Array.isArray(detail.resources)) {recovery(); return;}
            if (detail.resources.includes('goals')) void progress();
            if (detail.resources.includes('notes')) void notes.request();
            if (detail.resources.includes('goal-sources') || detail.resources.includes('goalSources') || detail.resources.includes('roster')) metadata();
        },
        recover: recovery,
        resume() {goals.resume(); notes.resume(); sources.resume();},
        close() {goals.close(); notes.close(); sources.close();},
    };
}
