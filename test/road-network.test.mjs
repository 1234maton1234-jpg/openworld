import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRoadNetwork} from '../shared/road-network.mjs';
import {roadGraph} from '../shared/road-graph.mjs';
import {createBridgePlanner} from '../shared/bridge-plan.mjs';
import {createCoastalHydrology} from '../shared/coastal-hydrology.mjs';
import {createUrbanTerrain} from '../shared/urban-terrain.mjs';

test('shared riverside network survives multiple seeds and crossing locations',()=>{
  for(const seed of [90620272,90620276,90620277]){
    const water=createCoastalHydrology({seed}),field=createUrbanTerrain([],water,{version:4}),planner=createBridgePlanner(water,field);
    for(const z of [-400,800]){
      const {x,width}=water.main(0,z),routes=[0,32].map((shift,i)=>planner.route({id:'h:'+i+':0',points:[[x-width-200,4.335,z+shift],[x+width+200,4.335,z+shift]]}));
      const network=buildRoadNetwork(routes);assert.deepEqual(network,buildRoadNetwork(routes.toReversed()));assert.ok(network.some(r=>r.bridge));
      for(const r of routes)for(const s of r.sections)if(s.kind==='land')for(const p of s.points)assert.ok(water.distance(p[0],p[2])>=58-.001);
      for(const r of network)for(let i=1;i<r.points.length-1;i++){const a=r.points[i-1],b=r.points[i],c=r.points[i+1],ux=b[0]-a[0],uz=b[2]-a[2],vx=c[0]-b[0],vz=c[2]-b[2];assert.ok(ux*vx+uz*vz>=-.01,'network contains an internal reverse bend');}
    }
  }
});

test('shared corridors produce one surface with the widest required carriageway',()=>{
  const routes=[{id:'a',width:10,points:[[0,4,0],[100,4,0]]},{id:'b',width:28,points:[[100,4,0],[50,4,0],[0,4,0]]}];
  const result=buildRoadNetwork(routes);assert.equal(result.length,1);assert.equal(result[0].width,28);assert.deepEqual(result,buildRoadNetwork(routes.toReversed()));
  const {edges}=roadGraph(result);assert.equal([...edges.values()].reduce((sum,e)=>sum+Math.hypot(e.a.p[0]-e.b.p[0],e.a.p[2]-e.b.p[2]),0),100);
});
test('crossroads are split into shared junctions while grade separated roads remain separate',()=>{
  const a={id:'a',width:18,points:[[-100,4,0],[100,4,0]]},b={id:'b',width:18,points:[[0,4,-100],[0,4,100]]};
  const network=buildRoadNetwork([a,b]);assert.equal(network.length,4);assert.ok(network.every(r=>[r.points[0],r.points.at(-1)].some(p=>p[0]===0&&p[2]===0)));
  assert.equal(buildRoadNetwork([a,{...b,points:b.points.map(p=>[p[0],12,p[2]])}]).length,2);
});
test('shared bridges retain one complete deck and matching land connections',()=>{
  const span={id:'bridge',kind:'crossing',width:28,points:[[0,4,0],[0,8,100],[0,4,200]],deckStart:0,deckEnd:2};
  const route={id:'a',width:18,archVersion:1,points:[[-100,4,0],...span.points],sections:[{kind:'land',points:[[-100,4,0],span.points[0]]},span]};
  const result=buildRoadNetwork([route,{...route,id:'b'}]);assert.equal(result.filter(r=>r.bridge).length,1);assert.deepEqual(result.find(r=>r.bridge).sections[0],span);assert.equal(result.filter(r=>!r.bridge).length,1);
});
