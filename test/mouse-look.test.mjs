import test from 'node:test';
import assert from 'node:assert/strict';
import {createMouseLook} from '../src/mouse-look.mjs';
test('lock transitions and cursor reentry cannot reuse stale coordinates',()=>{
  const moves=[],input=createMouseLook((x,y)=>moves.push([x,y]));
  input.absolute(20,30);input.absolute(24,28);assert.deepEqual(moves,[[4,-2]]);
  input.reset();input.locked(300,-200);input.locked(5,6);assert.deepEqual(moves.at(-1),[5,6]);
  input.reset();input.absolute(900,500);assert.equal(moves.length,2);input.absolute(903,501);assert.deepEqual(moves.at(-1),[3,1]);
  input.locked(Infinity,0);input.locked(2000,0);assert.equal(moves.length,3);
  input.reset();input.absolute(0,0);input.absolute(2000,0);input.absolute(2002,0);assert.deepEqual(moves.at(-1),[2,0]);
});
