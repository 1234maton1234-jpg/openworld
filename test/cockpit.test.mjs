import test from 'node:test';
import assert from 'node:assert/strict';
import {drivingDisplay} from '../src/cockpit.mjs';
test('dashboard reflects actual speed direction and braking',()=>{
  assert.deepEqual(drivingDisplay(0,false),{speed:0,gear:'N',braking:false});
  assert.deepEqual(drivingDisplay(10,false),{speed:36,gear:'D',braking:false});
  assert.deepEqual(drivingDisplay(-4,true),{speed:14,gear:'R',braking:true});
});
