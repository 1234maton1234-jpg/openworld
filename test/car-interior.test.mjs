import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,PerspectiveCamera,Raycaster,Vector3,Box3} from 'three';
import {createVehicleModel,createVehicles} from '../src/vehicles.mjs';
import {carSeats,stockCarSeats} from '../shared/car-seats.mjs';

test('stock sedan provides four seats within its fixed collision dimensions',()=>{
  const model=createVehicleModel('car'),size=new Box3().setFromObject(model.group).getSize(new Vector3());
  assert.deepEqual(model.seats,stockCarSeats());assert.equal(carSeats().length,2);
  assert.equal(model.group.children.filter(p=>/^(driver-seat|passenger-seat|rear-seat-)/.test(p.name)).length,4);
  assert.ok(size.x<=1.9&&size.y<=2&&size.z<=4.1);
  const local=createVehicles(new Scene(),{surface:()=>4,obstacle:()=>false,origin:()=>({x:0,z:0})});assert.deepEqual(local.targets()[1].vehicle.seats,model.seats);
});

test('default cabin has clear eye-level front and side sightlines from all four seats',()=>{
  const {group}=createVehicleModel('car');group.updateMatrixWorld(true);
  for(const [i,seat] of stockCarSeats().entries())for(const direction of i<2?[[0,0,-1],[-1,0,0],[1,0,0]]:[[-1,0,0],[1,0,0]]){
    const eye=new Vector3(seat[0],seat[1]+.75,seat[2]);
    const hits=new Raycaster(eye,new Vector3(...direction),0,3).intersectObject(group,true);
    assert.ok(hits.some(h=>h.object.material.transparent),'window should be present');
    assert.ok(hits.every(h=>h.object.material.transparent),'opaque shell must not block occupants');
  }
  assert.ok(group.getObjectByName('steering-wheel'));
  assert.ok(group.getObjectByName('passenger-seat'));
});

test('sedan exterior does not fill the cabin above seat cushions',()=>{
  const {group}=createVehicleModel('car');group.updateMatrixWorld(true);
  for(const [x,y,z] of stockCarSeats()){
    const hits=new Raycaster(new Vector3(x,y+.55,z),new Vector3(0,-1,0),0,.5).intersectObject(group,true);
    assert.ok(hits.every(h=>h.object.name!=='sculpted-body'));
  }
});

test('driver can look around independently of steering and chase-camera recentering',()=>{
  const system=createVehicles(new Scene(),{surface:()=>4,obstacle:()=>false,origin:()=>({x:0,z:0})});
  const car=system.targets()[1].vehicle;system.enter(car);system.look(-600,-200,true);
  const look={...system.firstPersonLook};assert.ok(look.yaw>1.4);assert.ok(look.pitch>0);
  for(let i=0;i<60;i++)system.update(.05,new Set(['KeyW','KeyA']),true,new PerspectiveCamera());
  assert.deepEqual(system.firstPersonLook,look);assert.ok(car.heading>0);
  system.enter(car);assert.deepEqual(system.firstPersonLook,{yaw:0,pitch:-.08});
});
