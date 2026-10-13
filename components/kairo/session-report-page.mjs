// Continue the initial event snapshot with one read. Delayed killmails must not
// shift its offsets, and newer source projections must not replace its summary.
export async function loadSessionReportPage(report, read, isCurrent = () => true) {
    const next = await read(report.events.length, {eventCursor: report.eventCursor, eventEnd: report.eventEnd});
    if (!isCurrent()) return null;
    const events = [...new Map([...report.events, ...next.events].map(event => [event.id, event])).values()];
    return {...report, events, more: next.more};
}
