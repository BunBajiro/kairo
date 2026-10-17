export type XY = {x: number; y: number};
export type Bounds = {minX: number; minY: number; maxX: number; maxY: number};
export type Size = {width: number; height: number};
/** CSS-pixel translation and CSS pixels per normalized world unit; unrelated to canvas devicePixelRatio. */
export type Camera = XY & {scale: number};
export type GeometryPoint = XY & {id: number};
export type TerritoryStyle = {key: string; colour: string; outlineColour?: string; strength: number; dim?: boolean; name?: string; source?: string};
/** Polygon vertices are world coordinates; from is an adjacent cell index, or -1 on the radius boundary. */
export type Geometry = {points: GeometryPoint[]; cells: {index: number; polygon: (XY & {from: number})[]}[]; buckets: Map<string, number[]>; radius: number};
export function projectKnownSystems<T extends {space: string; map_x: number; map_y: number}>(systems: T[]): (XY & {system: T})[];
export function pointBounds(points: XY[]): Bounds;
export function fitCamera(bounds: Bounds, size: Size): Camera;
export function clampCamera(camera: Camera, bounds: Bounds, size: Size): Camera;
export function zoomCamera(camera: Camera, factor: number, anchor: XY, bounds: Bounds, size: Size): Camera;
export function resizeCamera(camera: Camera, previous: Size, size: Size, bounds: Bounds): Camera;
export function geometryRevision(points: GeometryPoint[]): string;
export function paintRevision(styles: TerritoryStyle[]): string;
export function createTerritoryGeometry(points: GeometryPoint[], radius?: number): Geometry;
export function territoryOwnerAt(geometry: Geometry, x: number, y: number): number;
export function territoryComponents(geometry: Geometry, styles: TerritoryStyle[]): (TerritoryStyle & {count: number; candidates: GeometryPoint[]})[];
