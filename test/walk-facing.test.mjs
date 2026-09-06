import test from 'node:test';
import assert from 'node:assert/strict';
import {walkFacing} from '../src/walk-facing.mjs';
test('avatar faces actual movement for left, right and diagonal walking',()=>{
  for(const [x,z,target] of [[-1,0,Math.PI/2],[1,0,-Math.PI/2],[1,-1,-Math.PI/4],[0,-1,0]])assert.ok(Math.abs(walkFacing(0,x,z,1)-target)<1e-6);
  assert.equal(walkFacing(1,0,0,.1),1);
  assert.ok(walkFacing(Math.PI-.01,.01,1,.016)>Math.PI-.01);
});
