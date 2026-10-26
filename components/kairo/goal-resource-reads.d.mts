/** One fixed pilot; independent resource reads. Close on scope change; forced reads return drain waiters. */
export function createGoalResourceReads(options: {
    character: number; read(path: string): Promise<any>; publishGoals(value: any): void;
    publishNotes(value: any): void; publishSources(value: any): void;
    visible?(): boolean; metadataVisible?(): boolean; onError?(error: unknown): void;
}): {initial(): void; progress(): Promise<void>; notes(): Promise<void>; metadata(): Promise<void>;
    refresh(): Promise<void>; changed(detail?: {characterId?: number; resources?: string[]}): void;
    recover(): void; resume(): void; close(): void};
