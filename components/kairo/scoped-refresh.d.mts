export function createScopedRefresh<T>(options: {
    read: () => Promise<T>; publish: (value: T) => void;
    canRead?: () => boolean; onError?: (error: unknown) => void;
}): {request(options?: {force?: boolean}): Promise<void>; resume(): void; close(): void};
