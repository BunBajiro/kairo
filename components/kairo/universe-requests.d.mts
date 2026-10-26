export type UniverseRequestKey = 'kairo-universe-tab' | 'kairo-system-lookup' | 'kairo-universe-settings-tab' | 'kairo-universe-replay';
export type UniverseRequests = {set: (key: UniverseRequestKey, value: string) => void; take: (key: UniverseRequestKey) => string | null};
export function createUniverseRequests(storage?: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined): UniverseRequests;
export const setUniverseRequest: UniverseRequests['set'];
export const takeUniverseRequest: UniverseRequests['take'];
