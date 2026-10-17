/** One read plus one retained invalidation. Waiters resolve on drain/close; errors go to onError. */
export function createScopedRefresh<T>(options: {
    read: () => Promise<T>; publish: (value: T) => void;
    canRead?: () => boolean; onError?: (error: unknown) => void;
}): {request(options?: {force?: boolean}): Promise<void>; resume(): void; close(): void};
