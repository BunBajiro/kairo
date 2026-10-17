export type DatasetConnectionState = { phase: 'idle' | 'restarting' | 'refreshing' | 'delayed' | 'warning'; build: number | null; message: string };
export type DatasetRevision = { revision: string; recovery?: { message: string; failedBuild?: number } | null };
/** UI handoff owner; refresh must honor isCurrent after awaits. timeoutMs is a notice deadline. */
export function createDatasetConnection(options: {
    revision?: string;
    onState?: (state: DatasetConnectionState) => void;
    refresh: (revision: string, isCurrent: () => boolean) => Promise<void>;
    onComplete?: (revision: string) => void;
    seenRecovery?: (key: string) => boolean;
    rememberRecovery?: (key: string) => void;
    setTimer?: typeof setTimeout;
    clearTimer?: typeof clearTimeout;
    timeoutMs?: number;
}): {
    readonly state: DatasetConnectionState;
    restarting: (value: { build: number; startedAt?: string }) => void;
    connect: () => void;
    disconnect: () => void;
    revision: (value: DatasetRevision) => Promise<void>;
    cancelled: (value?: { message?: string }) => void;
    retry: () => void;
    dismiss: () => void;
    dispose: () => void;
};
