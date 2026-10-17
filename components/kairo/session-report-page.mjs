// Continue the initial event snapshot with one read. Delayed killmails must not
// shift its offsets, and newer source projections must not replace its summary.
/**
 * Append one event page using the report's original cursor and end time. read
 * receives the loaded count and snapshot boundary; errors propagate for retry.
 * Return null if isCurrent retires the request. Deduplicate event IDs while keeping
 * all existing summary/source fields; only an explicit report refresh replaces them.
 */
export async function loadSessionReportPage(report, read, isCurrent = () => true) {
    const next = await read(report.events.length, {eventCursor: report.eventCursor, eventEnd: report.eventEnd});
    if (!isCurrent()) return null;
    const events = [...new Map([...report.events, ...next.events].map(event => [event.id, event])).values()];
    return {...report, events, more: next.more};
}
