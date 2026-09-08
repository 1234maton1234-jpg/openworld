import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Bone} from 'three';
import {createClimbingPose} from '../src/climbing-pose.mjs';
import {playerPose} from '../shared/player-state.mjs';
test('climb pose raises named arms, alternates hands and restores rest pose',()=>{const model=new Group(),arm=new Bone();arm.name='RightArm';model.add(arm);const rest=arm.quaternion.clone(),pose=createClimbingPose(model);pose.update(.1,true);assert.ok(rest.angleTo(arm.quaternion)>1);const first=arm.quaternion.clone();pose.update(.1,true);assert.ok(first.angleTo(arm.quaternion)>.01);pose.reset();assert.ok(rest.equals(arm.quaternion));});
test('network pose preserves climbing but rejects it for seated players',()=>{const base={x:0,y:10,z:0,yaw:0,active:true,climbing:true};assert.equal(playerPose(base).climbing,true);assert.equal(playerPose({...base,seated:true}).climbing,false);assert.equal(playerPose({...base,vehicleType:'car'}).climbing,false);});
