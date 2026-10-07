import type {StreamElement} from './model';
export function studioProjectionKey(elements: StreamElement[]): string;
export type StudioPoint = {id: string; x: number; y: number};
export function createStudioDrag(options: {commit: (point: StudioPoint) => void; requestFrame: (callback: () => void) => number; cancelFrame: (id: number) => void}): {move(point: StudioPoint): void; finish(point?: StudioPoint | null): void; cancel(): void};
export function studioDragPoint(drag: StreamElement & {px: number; py: number}, clientX: number, clientY: number, bounds: {width: number; height: number}): StudioPoint | null;
export function createStudioPreview<T, R>(options: {read: (input: T) => Promise<R>; publish: (value: R) => void; onError?: (error: unknown) => void; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout; delay?: number}): {request(input: T): void; close(): void};
export function studioSourceChanged(key: string, detail?: {characterId?: number; resource?: string; key?: string; resources?: string[]}): boolean;
export function studioSourceRevision(key: string, character: number, data: Record<string, {status: string; updatedAt?: string; expiresAt?: string}>, sessions: any[]): string;
