"use client";
/**
 * Read-only view of the dashboard's current private resources plus its navigation
 * and refresh commands. Consumers must replace, never mutate, shared snapshot/name
 * objects: reference identity is part of the bounded rendering contract.
 * See ../../docs/INTERNAL-API.md for scope and invalidation ownership.
 */
import { createContext, useContext } from 'react';
import type { Bootstrap, ModuleState, StreamConfig } from './model';
/**
 * `character` is the selected connected pilot ID, or zero when none is selected.
 * `reload` refreshes bootstrap/configuration; `refresh` rereads selected-pilot state
 * and rejects when that owner's read failed. Resource revisions are opaque
 * invalidation dependencies, not timestamps or durable record revisions.
 */
export type KairoContext = {
    boot: Bootstrap;
    data: Record<string, ModuleState>;
    names: Record<string, string>;
    character: number;
    setCharacter: (id: number) => void;
    page: string;
    navigate: (id: string) => void;
    reload: () => Promise<void>;
    refresh: () => Promise<void>;
    /** Persist an accepted layout in order and update shell-owned saved state. */
    saveStream: (config: StreamConfig) => Promise<StreamConfig>;
    opsec: any;
    sessions: any[];
    activityRevision: string;
    goalsRevision: string;
    sessionsRevision: string;
};
export const Kairo = createContext<KairoContext | null>(null);
export const useKairo = () => { const c = useContext(Kairo); if (!c)
    throw new Error('Kairo context is unavailable.'); return c; };
