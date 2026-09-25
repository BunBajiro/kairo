import type {Camera, XY, Bounds, Size} from './universe-map-math.mjs';
export function wheelZoomFactor(delta: number, mode?: number, pageHeight?: number): number;
export function anchoredWheelCamera(current: Camera, pending: Camera | null, factor: number, anchor: XY, bounds: Bounds, size: Size): Camera;
export function pinchCamera(start: Camera, firstMidpoint: XY, midpoint: XY, firstDistance: number, distance: number, bounds: Bounds, size: Size): Camera;
export function dragCoast(camera: Camera, velocity: XY, sampleAge: number, bounds: Bounds, size: Size): {target: Camera; duration: number} | null;
export type Overview = Camera & Size;
export function overviewTransform(bounds: Bounds, width?: number, height?: number, padding?: number): Overview;
export function overviewViewport(camera: Camera, size: Size, overview: Overview): XY & Size;
export function projectedDistanceScale(cameraScale: number, worldUnitsPerLightYear: number, maxPixels?: number): {distance: number; width: number; label: string} | null;
