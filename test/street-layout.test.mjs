import test from 'node:test';
import assert from 'node:assert/strict';
import {generateRegion,validateRegion} from '../shared/city-plan.mjs';
import {retainStreet} from '../shared/street-layout.mjs';
test('mixed blocks retain connected perimeters and include three-way and four-way junctions',()=>{
  const sizes=new Set(),degrees=new Set();
  for(let x=-5;x<=5;x++)for(let z=-5;z<=5;z++){
    const original=generateRegion(x,z),roads=original.roads.filter(r=>retainStreet(r.id));sizes.add(roads.length);
    assert.deepEqual(validateRegion({...original,roads,lots:[]}),[]);
    const center=[x*2+1,z*2+1],spokes=[`v:${center[0]}:${center[1]-1}`,`v:${center[0]}:${center[1]}`,`h:${center[0]-1}:${center[1]}`,`h:${center[0]}:${center[1]}`];
    degrees.add(spokes.filter(id=>retainStreet(id)).length);
    for(const r of original.roads){const [axis,bx,bz]=r.id.split(':');if(Number(axis==='v'?bx:bz)%2===0)assert.equal(retainStreet(r.id),true);}
    for(const neighbor of [generateRegion(x+1,z),generateRegion(x,z+1)])for(const r of neighbor.roads){if(original.roads.some(v=>v.id===r.id))assert.equal(roads.some(v=>v.id===r.id),retainStreet(r.id));}
  }
  assert.deepEqual([...sizes].sort(),[10,11,12]);assert.ok(degrees.has(3)&&degrees.has(4));
});
test('saved streets override block merging',()=>{
  const road=generateRegion(1,1).roads.find(r=>!retainStreet(r.id))||generateRegion(0,0).roads.find(r=>!retainStreet(r.id));
  assert.ok(road);assert.equal(retainStreet(road.id,new Set([road.id])),true);
});
