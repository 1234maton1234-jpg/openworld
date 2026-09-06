import test from 'node:test';
import assert from 'node:assert/strict';
import {createBridgePlanner} from '../shared/bridge-plan.mjs';
import {createStore} from '../server/store.mjs';
import {validateRegion} from '../shared/city-plan.mjs';
import {segmentHitsLot} from '../shared/urban-plan.mjs';
import {createCoastalHydrology} from '../shared/coastal-hydrology.mjs';
import {createCityView} from '../src/city-view.mjs';
import * as THREE from 'three';
const field={base:()=>10};
const water={distance:(x,z)=>Math.abs(x),segments:()=>Array.from({length:48},(_,i)=>({riverId:'test',index:i,a:[0,-1200+i*50],b:[0,-1150+i*50],width:14}))};
const road=(id,z)=>({id,width:16,points:[[-240,10,z],[0,10,z],[240,10,z]],bridge:true});
test('nearby roads share short perpendicular crossings and dry bridgehead connections',()=>{
  const planner=createBridgePlanner(water,field),a=planner.route(road('a',0)),b=planner.route(road('b',30)),spans=a.sections.filter(s=>s.kind==='crossing');
  assert.equal(spans.length,1);assert.equal(b.sections.find(s=>s.kind==='crossing').id,spans[0].id);
  const s=spans[0],p=s.points[s.deckStart],q=s.points[s.deckEnd];assert.ok(Math.abs(p[0]-q[0])<150);assert.equal(p[2],q[2]);
  for(const head of [s.points[0],s.points.at(-1)])assert.ok(water.distance(head[0],head[2])>=84);
  for(const section of a.sections.filter(s=>s.kind==='land'))for(const p of section.points)assert.ok(water.distance(p[0],p[2])>=58);
  assert.deepEqual(a,createBridgePlanner(water,field).route(road('a',0)));
});
test('persisted roads retain their geometry and fix adjoining junctions',()=>{
  const old={id:'saved',width:12,points:[[-240,10,0],[-240,10,240]],bridge:false},planner=createBridgePlanner(water,field,{roads:[old]});
  assert.deepEqual(planner.route(old),old);assert.deepEqual(planner.route(road('next',0)).points[0],old.points[0]);
});

test('bridge mesh and walking follow the same continuous section heights',()=>{
  const r=createBridgePlanner(water,field).route(road('a',0)),s=r.sections.find(s=>s.kind==='crossing'),view=createCityView(new THREE.Scene());
  view.rebuild(0,0,{regions:[{x:0,z:0,version:5}],roads:[r],lots:[],parks:[],legacy:[]},[]);
  assert.ok(view.objects.some(o=>o.userData.bridgeStructure));
  for(const p of s.points)assert.ok(Math.abs(view.surface(p[0],p[2])-p[1])<.001);
  const count=view.objects.filter(o=>o.userData.bridgeStructure).length,second=createCityView(new THREE.Scene());second.rebuild(0,0,{regions:[{x:0,z:0,version:5}],roads:[r,{...r,id:'b'}],lots:[],parks:[],legacy:[]},[]);
  assert.equal(second.objects.filter(o=>o.userData.bridgeStructure).length,count);
});

test('river-aware districts stay connected, keep lots clear of neighboring roads and share spans',()=>{
  const store=createStore(':memory:'),h=createCoastalHydrology();try{const plans=[];for(let x=35;x<=37;x++)for(let z=36;z<=38;z++)plans.push(store.planner.region(x,z));const all=[...new Map(plans.flatMap(p=>p.roads).map(r=>[r.id,r])).values()],spans=new Map();
    for(const p of plans){assert.deepEqual(validateRegion(p),[]);for(const lot of p.lots)for(const r of all)assert.equal(r.points.slice(1).some((b,i)=>segmentHitsLot(r.points[i],b,lot,r.width/2+6)),false);}
    for(const r of all)for(const s of r.sections||[])if(s.kind==='crossing'){if(spans.has(s.id)){const old=spans.get(s.id);assert.ok(JSON.stringify(s.points)===JSON.stringify(old.points)||JSON.stringify(s.points)===JSON.stringify(old.points.toReversed()));}spans.set(s.id,s);for(const p of [s.points[0],s.points.at(-1)])assert.ok(h.distance(p[0],p[2])>=84);}
    assert.ok(spans.size>0);
  }finally{store.close();}
});
