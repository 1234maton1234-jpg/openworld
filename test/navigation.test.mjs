import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoadNavigator} from '../shared/navigation.mjs';
const road=(id,points)=>({id,width:12,points});
test('navigation splits intersections and snaps endpoints to road interiors',()=>{
  const nav=createRoadNavigator([road('a',[[-100,4,0],[100,4,0]]),road('b',[[0,4,-100],[0,4,100]])]);
  const r=nav.route({x:-50,z:3},{x:3,z:80});assert.equal(r.status,'ok');assert.equal(r.distance,130);assert.deepEqual(r.points[0],[-50,4,0]);assert.deepEqual(r.points.at(-1),[0,4,80]);assert.ok(r.points.some(p=>p[0]===0&&p[2]===0));
});
test('route takes the shorter connected road detour instead of crossing empty space',()=>{
  const nav=createRoadNavigator([road('bottom',[[0,0,0],[100,0,0]]),road('top',[[0,0,40],[100,0,40]]),road('left',[[0,0,0],[0,0,40]]),road('right',[[100,0,0],[100,0,40]])]);
  const r=nav.route({x:10,z:0},{x:20,z:40});assert.equal(r.status,'ok');assert.equal(r.distance,70);assert.ok(r.points.some(p=>p[0]===0));
});
test('overpasses do not connect to roads underneath; a connected bridge is routable',()=>{
  const nav=createRoadNavigator([road('ground',[[-100,0,0],[100,0,0]]),road('over',[[0,8,-100],[0,8,100]])]);
  assert.equal(nav.route({x:-50,y:0,z:0},{x:0,z:80}).status,'disconnected');
  const bridge=createRoadNavigator([road('a',[[-100,4,0],[0,4,0]]),{...road('bridge',[[0,4,0],[50,8,0],[100,4,0]]),bridge:true},road('b',[[100,4,0],[150,4,0]])]);
  assert.equal(bridge.route({x:-50,z:0},{x:140,z:0}).distance,190);
});
test('empty, invalid and out-of-range navigation requests are explicit',()=>{
  assert.equal(createRoadNavigator([]).route({x:0,z:0},{x:1,z:1}).status,'no-roads');
  const nav=createRoadNavigator([road('a',[[0,0,0],[100,0,0]])]);assert.equal(nav.route({x:0,z:0},{x:0,z:1000}).status,'off-road');assert.equal(nav.route({x:NaN,z:0},{x:0,z:0}).status,'invalid');
  assert.equal(nav.route({x:20,z:0},{x:80,z:0}).distance,60);
});
test('cached graph supports repeated searches without mutating topology',()=>{
  const roads=[];for(let i=0;i<=40;i++){roads.push(road('h'+i,[[0,0,i*20],[800,0,i*20]]),road('v'+i,[[i*20,0,0],[i*20,0,800]]));}
  const nav=createRoadNavigator(roads);assert.equal(nav.nodeCount,1681);
  for(const [start,target] of [[{x:0,z:0},{x:800,z:800}],[{x:800,z:800},{x:0,z:0}]]){const r=nav.route(start,target);assert.equal(r.status,'ok');assert.equal(r.distance,1600);assert.ok(r.visited<=nav.nodeCount);}
});
