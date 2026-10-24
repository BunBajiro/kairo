import type {ChainCamera} from './jspace-map-geometry.mjs';
export function paintChainCamera(surface: {
    root: HTMLElement | null; viewport: HTMLElement | null; world: HTMLElement | null;
    output: HTMLOutputElement | null; zoomOut: HTMLButtonElement | null; zoomIn: HTMLButtonElement | null;
    minimap: SVGRectElement | null;
}, camera: ChainCamera, size: {width: number; height: number}, limits: {min: number; max: number}): void;
