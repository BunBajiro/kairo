export type SchematicSystem = {system_id:number;schematic_x?:number;schematic_y?:number;map_x?:number;map_y?:number};
export type SchematicLayout<T extends SchematicSystem> = {
  points:{system:T;x:number;y:number}[];
  bounds:{minX:number;maxX:number;minY:number;maxY:number;width:number;height:number};
  scale:number;source:'sde'|'physical'|'grid';
};
/** Centered CCP position2D geometry; card dimensions request a uniform, collision-safe scale. */
export function schematicLayout<T extends SchematicSystem>(systems:readonly T[],options?:{nodeWidth?:number;nodeHeight?:number;gap?:number}):SchematicLayout<T>;
