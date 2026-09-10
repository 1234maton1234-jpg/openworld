import test from 'node:test';
import assert from 'node:assert/strict';
import {capturePlayerAnchor,localPlayerAnchor} from '../src/overview-player.mjs';

test('overview camera movement does not change the captured player position',()=>{
  const anchor=capturePlayerAnchor({x:3,z:-2},{x:12,y:4,z:18},.7,.5);
  const overviewCamera={x:900,y:200,z:-400};
  assert.deepEqual(anchor,{x:222,y:4,z:-122,yaw:.7,avatarYaw:.5});
  assert.deepEqual(localPlayerAnchor({x:3,z:-2},anchor),{x:12,y:4,z:18,yaw:.7,avatarYaw:.5});
  assert.deepEqual(overviewCamera,{x:900,y:200,z:-400});
});

test('player anchor restores correctly after overview origin rebasing',()=>{
  const anchor=capturePlayerAnchor({x:3,z:-2},{x:12,y:4,z:18},.7,.5);
  assert.deepEqual(localPlayerAnchor({x:8,z:-6},anchor),{x:-338,y:4,z:298,yaw:.7,avatarYaw:.5});
});
