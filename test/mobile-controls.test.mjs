import test from 'node:test';
import assert from 'node:assert/strict';
import {joystickCodes} from '../src/mobile-controls.mjs';

test('mobile joystick maps its dead zone and diagonals to movement keys',()=>{
  assert.deepEqual(joystickCodes(0.1,-0.1),[]);
  assert.deepEqual(joystickCodes(0,-1),['KeyW']);
  assert.deepEqual(joystickCodes(0.8,-0.8),['KeyW','KeyD']);
  assert.deepEqual(joystickCodes(-1,0),['KeyA']);
  assert.deepEqual(joystickCodes(0,1),['KeyS']);
});
