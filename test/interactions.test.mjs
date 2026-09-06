import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Object3D,Vector3} from 'three';
import {collectInteractions,findInteraction,seatPosition} from '../src/interactions.mjs';
test('seat prompts require range, facing and visibility and follow rebasing',()=>{
  const root=new Group(),node=new Object3D();node.position.set(0,1,-2);node.userData.interaction={type:'seat',yaw:0};root.add(node);
  const seats=collectInteractions(root),eye=new Vector3(0,1.7,0),forward=new Vector3(0,0,-1);
  assert.equal(seats.length,1);assert.equal(findInteraction(seats,eye,forward),seats[0]);
  assert.equal(findInteraction(seats,eye,new Vector3(0,0,1)),null);
  assert.equal(findInteraction(seats,new Vector3(0,1.7,4),forward),null);
  assert.equal(findInteraction(seats,eye,forward,()=>false),null);
  root.position.set(-70,4,140);assert.deepEqual(seatPosition(seats[0]).toArray(),[-70,5,138]);
  assert.equal(collectInteractions(new Group(),'unknown').length,0);
});
