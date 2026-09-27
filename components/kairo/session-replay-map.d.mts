export function sessionReplaySpace(
    visits: readonly {id: number | string; systemId: number}[],
    currentVisitId: number | string | undefined,
    systems: ReadonlyMap<number, {space?: string}>,
): 'known' | 'wormhole';
