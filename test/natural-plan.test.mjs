import test from 'node:test';
import assert from 'node:assert/strict';
import {generateRegion,validateRegion} from '../shared/city-plan.mjs';
import {generateNaturalRegion} from '../shared/natural-plan.mjs';
test('curved districts stay connected, deterministic and compatible with saved boundaries',()=>{
  for(const [x,z] of [[0,0],[-1,0],[8,8],[-8,12]]){const p=generateNaturalRegion(x,z);assert.deepEqual(p,generateNaturalRegion(x,z));assert.deepEqual(validateRegion(p),[]);assert.ok(p.lots.length>0);
    const old=generateRegion(x+1,z);for(const road of p.roads.filter(r=>old.roads.some(o=>o.id===r.id)))assert.deepEqual(road,old.roads.find(o=>o.id===road.id));
    assert.ok(p.roads.some(r=>r.points.some(v=>Math.abs(v[0]-r.points[0][0])>15&&Math.abs(v[2]-r.points[0][2])>15)));
  }
});
