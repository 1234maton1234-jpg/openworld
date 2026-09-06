import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoastalHydrology,coastAt} from '../shared/coastal-hydrology.mjs';
import {roadProfile} from '../shared/road-hierarchy.mjs';
import {createStore} from '../server/store.mjs';
import {createUrbanTerrain} from '../shared/urban-terrain.mjs';
import {hash} from '../shared/world-noise.mjs';
test('rivers have 3.5x widths and remain connected across reach boundaries',()=>{
  const h=createCoastalHydrology();
  for(let z=-4800;z<=4800;z+=100){const m=h.main(0,z);assert.ok(Math.abs(m.width/(100+45*hash(0,0,1602)+35*Math.sin(z/4200)**2)-3.5)<1e-10);}
  const lines=new Map();
  for(let x=-2000;x<=5000;x+=128)for(let z=0;z<=2400;z+=128)for(const l of h.segments(x,z))if(l.riverId==='coastal:0:0:east')lines.set(l.index,l);
  const branch=[...lines.values()].sort((a,b)=>a.index-b.index),b=branch.at(-1).b;
  assert.equal(branch.length,48);assert.ok(branch.every(l=>l.width>=49));
  assert.ok(h.distance(...b)<0);
  for(const z of [-2400,0,2400])assert.ok(Math.abs(h.main(0,z-.01).x-h.main(0,z+.01).x)<.1);
});
test('main rivers are wide, tributaries meet them, and estuaries open into continuous sea',()=>{
  const h=createCoastalHydrology(),other=createCoastalHydrology();
  for(const z of [-12000,-2400,0,2400,12000]){const m=h.main(0,z);assert.ok(m.width>=100);assert.ok(h.distance(m.x,z)<0);assert.ok(h.distance(m.x+70,z)<14);assert.equal(h.distance(m.x,z),other.distance(m.x,z));}
  for(const x of [-10000,0,20000]){assert.ok(h.distance(x,coastAt(x)+1000)<0);assert.equal(h.oceanDepth(x,coastAt(x)+2000),36);}
  let tributary=false;for(let z=1500;z<=2400;z+=100){const lines=h.segments(h.main(0,z).x,z);assert.ok(lines.some(l=>l.kind==='main'));tributary||=lines.some(l=>l.kind==='east'||l.kind==='west');}assert.ok(tributary);
  assert.ok(h.main(0,40000).width>h.main(0,0).width);
});

test('coastal regions support graded streets while offshore regions have no roads or claims',async ()=>{
  const s=(await createStore(':memory:'));try{const town=(await s.planner.around(9,577)),classes=new Set(town.roads.map(r=>r.class));assert.ok(classes.has('arterial')&&classes.has('collector')&&classes.has('local'));for(const lot of town.lots)assert.notEqual(town.roads.find(r=>r.id===lot.entrance.roadId).class,'arterial');const sea=(await s.planner.around(0,620));assert.equal(sea.lots.length,0);assert.equal(sea.roads.length,0);const f=createUrbanTerrain([],createCoastalHydrology());assert.ok(f.height(0,43400)<-20);}finally{(await s.close());}
});
test('arterial, collector and local profiles are stable across positive and negative coordinates',()=>{
  assert.deepEqual(roadProfile('v:4:9'),{class:'arterial',width:28});assert.equal(roadProfile('h:9:-2').width,18);assert.equal(roadProfile('v:-3:0').width,10);
});
