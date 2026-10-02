import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMapDisplayPrefs,projectMapDisplay} from '../../components/kairo/map-display-model.mjs';
import {traceChainPath} from '../../components/kairo/jspace-map-geometry.mjs';

const nodes=Array.from({length:8},(_,i)=>({system_id:i+1,x:i*300,y:i%2*100,status:'unknown'}));
const edge=(from,to)=>({id:from+':'+to,from_system_id:from,to_system_id:to,kind:'gate'});
const group=(id,memberIds,extra={})=>({id,name:id,kind:'custom',memberIds,collapsed:true,...extra});

test('default display and disabled focus preserve every canonical card, coordinate and connection',()=>{
 const connections=[edge(1,2),edge(2,3)],input=JSON.stringify({nodes,connections});
 const result=projectMapDisplay({nodes,connections,focus:{enabled:false,systemIds:[1],contextScale:.5}});
 assert.deepEqual(result.visibleNodes,nodes.map(node=>({...node,displayScale:1,displayDetail:'full'})));
 assert.deepEqual(result.visibleConnections,connections);assert.strictEqual(result.visibleConnections[0],connections[0]);
 assert.deepEqual(result.groups,[]);assert.equal(result.hiddenIds.size,0);assert.equal(JSON.stringify({nodes,connections}),input);
});

test('display preferences are bounded, duplicate-safe and do not mutate saved input',()=>{
 const raw={knownScale:.1,wormholeScale:10,groups:[group('custom:home',[1,1,2,-1,NaN,'3'],{parentSystemId:2,name:'  Home  '}),group('custom:home',[3]),group('bad id',[3]),group('region:1',[],{kind:'region'})]};
 const before=JSON.stringify(raw),value=normalizeMapDisplayPrefs(raw);
 assert.equal(value.knownScale,.5);assert.equal(value.wormholeScale,1.5);assert.equal(value.version,1);
 assert.deepEqual(value.groups,[group('custom:home',[1,2],{name:'Home',parentSystemId:2})]);assert.equal(JSON.stringify(raw),before);
 const bounded=normalizeMapDisplayPrefs({knownScale:NaN,wormholeScale:Infinity,groups:Array.from({length:40},(_,i)=>group('g'+i,Array.from({length:700},(_,n)=>n+1),{parentSystemId:999}))});
 assert.equal(bounded.groups.length,32);assert.equal(bounded.groups[0].memberIds.length,600);assert.equal(bounded.groups[0].parentSystemId,undefined);
 assert.equal(bounded.knownScale,1);assert.equal(bounded.wormholeScale,1);
});

test('collapse hides interior members but retains entry, exit, parent, active route and selected cards',()=>{
 const connections=[edge(1,2),edge(2,3),edge(3,4),edge(4,5),edge(5,6),edge(2,7)],prefs={groups:[group('home',[2,3,4,5,7],{parentSystemId:7})]};
 const before=JSON.stringify({nodes,connections,prefs}),result=projectMapDisplay({nodes,connections,prefs,protectedIds:[4]});
 assert.deepEqual([...result.hiddenIds],[3]);assert.deepEqual(result.groups[0].boundaryIds,[2,5]);assert.equal(result.groups[0].anchorSystemId,7);
 assert.deepEqual(result.groups[0].anchor,{x:1800,y:0});assert.equal(result.groups[0].hiddenCount,1);assert.equal(result.groups[0].visibleCount,4);
 assert.deepEqual(result.visibleConnections.map(e=>e.id),['1:2','4:5','5:6','2:7']);
 const route=traceChainPath(nodes,connections,1,6),active=projectMapDisplay({nodes,connections,prefs,protectedIds:route.nodes});
 assert.deepEqual(traceChainPath(active.visibleNodes,active.visibleConnections,1,6),route);
 assert.equal(JSON.stringify({nodes,connections,prefs}),before,'projection cannot rewrite canonical topology or saved layout');
});

test('custom ownership overrides geographic groups and same-kind overlap follows saved order',()=>{
 const prefs={groups:[group('region',[1,2,3,4],{kind:'region'}),group('home',[2,3]),group('constellation',[3,4,5],{kind:'constellation'}),group('second',[3,6])]};
 const result=projectMapDisplay({nodes,connections:[],prefs});
 assert.deepEqual(result.groups.map(g=>[g.id,g.memberIds]),[['region',[1]],['home',[2,3]],['constellation',[4,5]],['second',[6]]]);
 assert.deepEqual([...result.hiddenIds],[3,5]);assert.deepEqual(result.groups.map(g=>g.anchorSystemId),[1,2,4,6]);
 const expanded=projectMapDisplay({nodes,connections:[],prefs:{...prefs,groups:prefs.groups.map(g=>g.id==='home'?{...g,collapsed:false}:g)}});
 assert.ok(expanded.visibleNodes.some(n=>n.system_id===3),'expanded custom member is not recollapsed by an overlapping region');
 const overlap=projectMapDisplay({nodes,connections:[],prefs:{groups:[group('custom',[1,2]),group('region',[2,3],{kind:'region',parentSystemId:2})]}});
 assert.ok(overlap.hiddenIds.has(2),'a lower-priority group cannot retain a parent it no longer owns');
 assert.equal(overlap.groups[1].anchorSystemId,3);assert.equal(overlap.groups[1].parentSystemId,undefined);
});

test('cross-group endpoints stay real and stale memberships or absent endpoints add no fake cards or edges',()=>{
 const connections=[edge(1,4),edge(2,3),edge(3,99)],prefs={groups:[group('a',[1,2,3,99]),group('b',[4,5,6]),group('empty',[99])]};
 const result=projectMapDisplay({nodes,connections,prefs});
 assert.deepEqual(result.groups.map(g=>g.id),['a','b']);assert.deepEqual(result.groups[0].boundaryIds,[1]);assert.deepEqual(result.groups[1].boundaryIds,[4]);
 assert.deepEqual(result.visibleConnections,[connections[0]]);assert.ok(result.visibleNodes.every(n=>nodes.some(original=>original.system_id===n.system_id)));
 assert.deepEqual(result.groups[0].memberIds,[1,2,3]);
});

test('known and wormhole scales are independent; focused and protected context retains full detail',()=>{
 const byId=new Map(nodes.map(node=>[node.system_id,{space:node.system_id%2?'known':'wormhole'}]));
 const prefs={knownScale:.6,wormholeScale:1.4,groups:[group('home',[5,6,7],{parentSystemId:5})]};
 const result=projectMapDisplay({nodes,connections:[edge(7,8)],byId,prefs,protectedIds:[2],focus:{enabled:true,systemIds:[6],contextScale:.7}});
 const byNode=new Map(result.visibleNodes.map(node=>[node.system_id,node]));
 assert.equal(byNode.get(1).displayScale,.6*.7);assert.equal(byNode.get(1).displayDetail,'compact');
 for(const id of [2,5,6,7,8])assert.equal(byNode.get(id).displayDetail,'full','protected, parent, focused and both boundary endpoints retain full detail');
 assert.equal(byNode.get(2).displayScale,1.4);assert.equal(byNode.get(5).displayScale,.6);assert.equal(byNode.get(6).displayScale,1.4);
 assert.ok(byNode.has(6),'focused collapsed member must remain visible');
 const disabled=projectMapDisplay({nodes,connections:[],byId,prefs:{knownScale:.6,wormholeScale:1.4},focus:{enabled:false,systemIds:[]}});
 assert.ok(disabled.visibleNodes.every(node=>node.displayDetail==='full'));assert.equal(disabled.visibleNodes[0].displayScale,.6);assert.equal(disabled.visibleNodes[1].displayScale,1.4);
});

test('large supported maps remain bounded and source objects can be frozen',()=>{
 const many=Array.from({length:600},(_,i)=>Object.freeze({system_id:i+1,x:i*300,y:0}));Object.freeze(many);
 const connections=Array.from({length:599},(_,i)=>Object.freeze(edge(i+1,i+2)));Object.freeze(connections);
 const result=projectMapDisplay({nodes:many,connections,prefs:{groups:[group('large',many.map(n=>n.system_id))]}});
 assert.equal(result.visibleNodes.length,1);assert.equal(result.groups[0].hiddenCount,599);assert.equal(result.groups[0].anchorSystemId,1);assert.equal(result.visibleConnections.length,0);
 const restored=projectMapDisplay({nodes:many,connections,prefs:{groups:[group('large',many.map(n=>n.system_id),{collapsed:false})]}});
 assert.equal(restored.visibleNodes.length,600);assert.equal(restored.visibleConnections.length,599);
});
