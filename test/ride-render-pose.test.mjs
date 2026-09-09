import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3} from 'three';
import {rideRenderPose} from '../src/ride-render-pose.mjs';

test('passenger pose stays attached to rendered seat through turns and world rebases',()=>{
  const group=new Group(),vehicle={group,type:'car',seats:[[.35,.65,.6]]},origin={x:8,z:-3};
  group.position.set(12,4,-6);group.rotation.set(.2,1.1,0,'YXZ');group.updateMatrixWorld(true);
  const expected=group.localToWorld(new Vector3(.35,.65,.6)),pose=rideRenderPose(vehicle,0,origin);
  assert.ok(Math.abs(pose.x-expected.x-origin.x*70)<1e-8);assert.ok(Math.abs(pose.y-expected.y+.87)<1e-8);assert.ok(Math.abs(pose.z-expected.z-origin.z*70)<1e-8);
  group.position.x-=70;origin.x++;assert.deepEqual(rideRenderPose(vehicle,0,origin),pose);
  assert.equal(rideRenderPose(null,0,origin),null);assert.equal(rideRenderPose(vehicle,2,origin),null);
});
