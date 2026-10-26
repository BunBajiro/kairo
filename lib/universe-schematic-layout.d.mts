export type SchematicSystem = {system_id:number;schematic_x?:number;schematic_y?:number;map_x?:number;map_y?:number};
export type SchematicLayout<T extends SchematicSystem> = {
  points:{system:T;x:number;y:number}[];
  bounds:{minX:number;maxX:number;minY:number;maxY:number;width:number;height:number};
  scale:number;source:'sde'|'physical'|'grid';
};
/** Centered display geometry; input is not mutated and valid IDs are deduplicated.
 * Dimensions/gap and output coordinates share display units, not physical LY.
 * Select complete schematic positions, otherwise complete physical positions.
 * Missing or coincident selected positions use one grid for the whole group.
 * Positive width+height request uniform card separation;
 * bounds enclose centres, not rectangles. See docs/SCHEMATIC-GEOMETRY.md. */
export function schematicLayout<T extends SchematicSystem>(systems:readonly T[],options?:{nodeWidth?:number;nodeHeight?:number;gap?:number}):SchematicLayout<T>;
