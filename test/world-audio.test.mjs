import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceStepClock} from '../src/world-audio.mjs';

test('footsteps stop immediately when the player is not walking',()=>{
  assert.deepEqual(advanceStepClock(.4,.2,false,false),{clock:0,steps:0});
});

test('running produces a faster cadence than walking',()=>{
  const walking=advanceStepClock(0,1,true,false),running=advanceStepClock(0,1,true,true);
  assert.equal(walking.steps,2);
  assert.equal(running.steps,3);
  assert.ok(running.clock>=0&&running.clock<.32);
});

test('step clock preserves partial cadence across frames',()=>{
  const first=advanceStepClock(0,.25,true,false),second=advanceStepClock(first.clock,.25,true,false);
  assert.equal(first.steps,0);
  assert.equal(second.steps,1);
  assert.ok(Math.abs(second.clock-.02)<1e-9);
});
