"use client";
import { createContext, useContext } from 'react';
import type { Bootstrap, ModuleState } from './model';
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
    opsec: any;
    sessions: any[];
    activityRevision: string;
    goalsRevision: string;
    sessionsRevision: string;
};
export const Kairo = createContext<KairoContext | null>(null);
export const useKairo = () => { const c = useContext(Kairo); if (!c)
    throw new Error('Kairo context is unavailable.'); return c; };
