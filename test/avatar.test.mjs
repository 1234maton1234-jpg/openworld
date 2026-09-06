import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Vector3} from 'three';
import {createAvatar,chasePosition,cyclingLeg,cyclingArm} from '../src/avatar.mjs';
test('first person cycling shows fitted arms and restores the body on switching back',()=>{
  const avatar=createAvatar(new Scene());
  const state={position:new Vector3(0,.24,.35),yaw:0,visible:true,moving:false,seated:true,vehicleType:'bike',dt:.016};
  avatar.update({...state,firstPerson:true});
  assert.equal(avatar.root.children.filter(p=>p.visible).length,6);
  assert.equal(avatar.root.getObjectByName('hand-left').visible,true);
  avatar.update({...state,firstPerson:false});assert.ok(avatar.root.children.every(p=>p.visible));
});
test('cycling hands meet handlebar grips through turns with bent, fixed-length arms',()=>{
  const avatar=createAvatar(new Scene()),axis=new Vector3(0,1,0);
  for(const yaw of [0,.7,Math.PI,-1.5]){
    const vehicle=new Vector3(20,4,30),rider=vehicle.clone().add(new Vector3(0,.24,.35).applyAxisAngle(axis,yaw));
    avatar.update({position:rider,yaw,visible:true,moving:false,seated:true,vehicleType:'bike',dt:.016});avatar.root.updateMatrixWorld(true);
    for(const side of [-1,1]){const arm=cyclingArm(side);assert.ok(Math.abs(arm.shoulder.distanceTo(arm.elbow)-.4)<1e-6);assert.ok(Math.abs(arm.elbow.distanceTo(arm.hand)-.4)<1e-6);
      const actual=avatar.root.getObjectByName(side<0?'hand-left':'hand-right').getWorldPosition(new Vector3()),grip=new Vector3(side*.3,1.2,-.5).applyAxisAngle(axis,yaw).add(vehicle);assert.ok(actual.distanceTo(grip)<1e-6);
    }
  }
});
test('cycling knees bend forward and feet follow opposite pedals with stable limb lengths',()=>{
  for(let a=0;a<Math.PI*2;a+=.1){const {hip,knee,foot}=cyclingLeg(a),other=cyclingLeg(a+Math.PI).foot;
    assert.ok(Math.abs(hip.distanceTo(knee)-.42)<1e-6);assert.ok(Math.abs(knee.distanceTo(foot)-.42)<1e-6);
    assert.ok(knee.z<0);assert.ok(foot.y<.51);assert.ok(Math.abs(foot.y+other.y-.66)<1e-6);assert.ok(Math.abs(foot.z+other.z+.46)<1e-6);
  }
});
test('third person camera offset leaves player coordinates unchanged and avatar follows pose',()=>{
  const eye=new Vector3(10,6,20),direction=new Vector3(0,0,-1),position=eye.clone();assert.deepEqual(chasePosition(eye,direction).toArray(),[10,6.8,24]);assert.deepEqual(eye.toArray(),position.toArray());
  const avatar=createAvatar(new Scene());avatar.update({position,yaw:1,visible:true,moving:true,seated:false,dt:.1});assert.equal(avatar.root.visible,true);assert.deepEqual(avatar.root.position.toArray(),position.toArray());avatar.update({position,yaw:0,visible:false,moving:false,seated:true,dt:.1});assert.equal(avatar.root.visible,false);
});
