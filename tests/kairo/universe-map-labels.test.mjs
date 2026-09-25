import test from 'node:test';
import assert from 'node:assert/strict';
import {mapLabelBounds,labelEdgeOpacity,labelCollisionBounds} from '../../components/kairo/universe-map-labels.mjs';

const viewport={width:900,height:600};
test('bounds include glyph overhangs, descenders and halo, rather than just an anchor or advance width',()=>{
 const rect=mapLabelBounds(100,200,{width:70,actualBoundingBoxLeft:2,actualBoundingBoxRight:73,actualBoundingBoxAscent:13,actualBoundingBoxDescent:4},16);
 assert.deepEqual(rect,{left:96.5,right:174.5,top:185.5,bottom:205.5});
 assert.deepEqual(labelCollisionBounds(rect),{left:90.5,right:180.5,top:179.5,bottom:211.5});
});
test('all four edges fade smoothly before clipping, with full opacity in the readable interior',()=>{
 for(const edge of ['left','right','top','bottom']){
  const alpha=clearance=>{const rect={left:100,right:200,top:200,bottom:220};if(edge==='left')rect.left=4+clearance;if(edge==='right')rect.right=896-clearance;if(edge==='top')rect.top=4+clearance;if(edge==='bottom')rect.bottom=596-clearance;return labelEdgeOpacity(rect,viewport);};
  assert.equal(alpha(44),1);assert.equal(alpha(22),.5);assert.equal(alpha(0),0);assert.equal(alpha(-1),0);
  let previous=0;for(let clearance=0;clearance<=44;clearance+=.25){const next=alpha(clearance);assert.ok(next>=previous&&next<=1);assert.ok(next-previous<.009);previous=next;}
  assert.ok(alpha(.01)<.000001);assert.ok(1-alpha(43.99)<.000001);
 }
});
test('long names fade based on their far edge while their system anchor is still well inside the map',()=>{
 const metrics={width:200,actualBoundingBoxAscent:12,actualBoundingBoxDescent:3};
 const entering=mapLabelBounds(680,250,metrics,14),interior=mapLabelBounds(620,250,metrics,14);
 assert.ok(labelEdgeOpacity(entering,viewport)>0&&labelEdgeOpacity(entering,viewport)<.3);
 assert.equal(labelEdgeOpacity(interior,viewport),1);
 assert.equal(labelEdgeOpacity(mapLabelBounds(700,250,metrics,14),viewport),0);
});
test('fade is independent of camera zoom and device pixel ratio for the same screen footprint',()=>{
 const rect=mapLabelBounds(740,250,{width:120,actualBoundingBoxAscent:12,actualBoundingBoxDescent:3},14);
 const expected=labelEdgeOpacity(rect,viewport);
 for(const scale of [.5,1,3,20]){const camera={x:130,y:-170,scale};const world={x:(740-camera.x)/scale,y:(250-camera.y)/scale};assert.equal(labelEdgeOpacity(mapLabelBounds(world.x*scale+camera.x,world.y*scale+camera.y,{width:120,actualBoundingBoxAscent:12,actualBoundingBoxDescent:3},14),viewport),expected);}
 assert.equal(labelEdgeOpacity({...rect,top:NaN},viewport),0);
 assert.equal(labelEdgeOpacity(rect,viewport,0),0);
});
