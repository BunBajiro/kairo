/** Screen-space CSS-pixel bounds, including glyph overhang and halo; never DPR-scaled canvas coordinates. */
export type LabelRect = {left:number;top:number;right:number;bottom:number};
export type LabelMetrics = {width:number;actualBoundingBoxLeft?:number;actualBoundingBoxRight?:number;actualBoundingBoxAscent?:number;actualBoundingBoxDescent?:number};
export function mapLabelBounds(x:number,baseline:number,metrics:LabelMetrics,fontSize:number,halo?:number):LabelRect;
export function labelEdgeOpacity(rect:LabelRect,viewport:{width:number;height:number},fade?:number,inset?:number):number;
export function labelCollisionBounds(rect:LabelRect,padding?:number):LabelRect;
