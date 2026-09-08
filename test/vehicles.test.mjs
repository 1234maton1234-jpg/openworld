import test from 'node:test';
import assert from 'node:assert/strict';
import {driveStep,VEHICLES,createVehicles} from '../src/vehicles.mjs';
import {Scene,PerspectiveCamera} from 'three';

test('land vehicles cross sea level and allow exiting below water while retaining solid collisions',()=>{
  for(const index of [0,1]){
    let blocked=false;const system=createVehicles(new Scene(),{surface:(x,z)=>.55+(z-42)*.02,obstacle:()=>blocked,origin:()=>({x:0,z:0})}),camera=new PerspectiveCamera();
    system.update(.01,new Set(),true,camera);const v=system.targets()[index].vehicle;system.enter(v);
    for(let i=0;i<160;i++)system.update(.05,new Set(['KeyW']),true,camera);
    assert.ok(v.y<0);assert.ok(v.speed>0);
    blocked=true;system.update(.05,new Set(['KeyW']),true,camera);assert.equal(v.speed,0);assert.equal(system.exit(),null);
    blocked=false;assert.ok(system.exit());
  }
});

test('exited cars coast without throttle, roll wheels and stop at obstacles',()=>{
  let blocked=false;const system=createVehicles(new Scene(),{surface:()=>4.3,obstacle:()=>blocked,origin:()=>({x:0,z:0})}),camera=new PerspectiveCamera();
  system.update(.01,new Set(),true,camera);const car=system.targets()[1].vehicle;system.enter(car);car.speed=8;assert.ok(system.exit());assert.equal(car.speed,8);
  const z=car.z,wheel=car.wheels[0].spin.rotation.x;system.update(.05,new Set(['KeyW','KeyA']),true,camera);
  assert.ok(car.z<z);assert.ok(car.speed>0&&car.speed<8);assert.notEqual(car.wheels[0].spin.rotation.x,wheel);assert.equal(car.steer,0);
  const paused=car.z;system.update(.05,new Set(),false,camera);assert.equal(car.z,paused);
  blocked=true;system.update(.05,new Set(),true,camera);assert.equal(car.speed,0);
});
test('coasting cars naturally stop and can be reentered without losing momentum',()=>{
  const system=createVehicles(new Scene(),{surface:()=>4.3,obstacle:()=>false,origin:()=>({x:0,z:0})}),camera=new PerspectiveCamera();system.update(.01,new Set(),true,camera);const car=system.targets()[1].vehicle;
  system.enter(car);car.speed=-4;system.exit();const z=car.z;system.update(.05,new Set(),true,camera);assert.ok(car.z>z);const speed=car.speed;system.enter(car);assert.equal(car.speed,speed);system.exit();
  for(let i=0;i<100;i++)system.update(.05,new Set(),true,camera);assert.equal(car.speed,0);assert.equal(car.coasting,false);
});
test('origin changes move all vehicles immediately without advancing driving or wheels',()=>{
  const origin={x:0,z:0},system=createVehicles(new Scene(),{surface:()=>4.3,obstacle:()=>false,origin:()=>origin}),camera=new PerspectiveCamera();
  system.update(.016,new Set(),false,camera);const car=system.targets()[1].vehicle;system.enter(car);system.update(.05,new Set(['KeyW']),true,camera);
  const before={x:car.x,z:car.z,speed:car.speed,phase:car.crankPhase,wheel:car.wheels[0].spin.rotation.x};
  for(const [x,z] of [[1,0],[1,-1],[-10,7],[0,0]]){origin.x=x;origin.z=z;system.rebase();for(const {vehicle:v} of system.targets()){assert.ok(Math.abs(v.group.position.x+x*70-v.x)<1e-8);assert.ok(Math.abs(v.group.position.z+z*70-v.z)<1e-8);assert.equal(v.group.matrixWorld.elements[12],v.group.position.x);}assert.deepEqual({x:car.x,z:car.z,speed:car.speed,phase:car.crankPhase,wheel:car.wheels[0].spin.rotation.x},before);}
});
test('vehicles accelerate within limits, brake, reverse and stop at obstacles',()=>{
  for(const type of ['bike','car']){const v={type,x:0,z:0,speed:0,heading:0};for(let i=0;i<300;i++)driveStep(v,{forward:true},.05,()=>true);assert.equal(v.speed,VEHICLES[type].max);assert.ok(v.z<0);
    for(let i=0;i<60;i++)driveStep(v,{brake:true},.05,()=>true);assert.equal(v.speed,0);
    for(let i=0;i<100;i++)driveStep(v,{back:true},.05,()=>true);assert.equal(v.speed,-VEHICLES[type].reverse);
    const z=v.z;driveStep(v,{back:true},.05,()=>false);assert.equal(v.z,z);assert.equal(v.speed,0);
  }
});
test('car steering ramps and returns smoothly with reduced high speed yaw',()=>{
  const turn=speed=>{const v={type:'car',x:0,z:0,speed,heading:0};driveStep(v,{left:true},1/60,()=>true);assert.ok(v.steer>0&&v.steer<.2);for(let i=0;i<60;i++)driveStep(v,{left:true},1/60,()=>true);return v;};
  const low=turn(7),high=turn(28);assert.ok(Math.abs(high.steerAngle)<Math.abs(low.steerAngle));assert.ok(Math.abs(high.yawRate)<.65);
  const before=low.steer;driveStep(low,{},1/60,()=>true);assert.ok(low.steer>0&&low.steer<before);
});
test('opposite throttle brakes before reversing and handbrake permits controlled slip',()=>{
  const v={type:'car',x:0,z:0,speed:12,heading:0};driveStep(v,{back:true},.05,()=>true);assert.ok(v.speed>0&&v.speed<12);
  for(let i=0;i<60;i++)driveStep(v,{back:true},.05,()=>true);assert.ok(v.speed<0);
  const simulate=handbrake=>{const s={type:'car',x:0,z:0,speed:20,heading:0};for(let i=0;i<15;i++)driveStep(s,{left:true,handbrake},.05,()=>true);return Math.abs(s.heading-s.travelHeading);};
  assert.ok(simulate(true)>simulate(false)*2);
});
test('car handling is consistent across 30 and 60 fps',()=>{
  const run=dt=>{const v={type:'car',x:0,z:0,speed:0,heading:0};for(let t=0;t<120;t++)driveStep(v,{forward:true,left:t*dt>1},dt,()=>true);return v;};
  const a=run(1/60),b={type:'car',x:0,z:0,speed:0,heading:0};for(let i=0;i<60;i++)driveStep(b,{forward:true,left:i/30>1},1/30,()=>true);
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.2);assert.ok(Math.abs(a.speed-b.speed)<.01);
});

test('high speed cornering stays stable and handbrake preserves momentum then recovers grip',()=>{
  const fast={type:'car',x:0,z:0,speed:30,heading:0};
  for(let i=0;i<120;i++)driveStep(fast,{forward:true,left:true},1/120,()=>true);
  assert.ok(Math.abs(fast.yawRate*fast.speed)<=10);
  const drift={type:'car',x:0,z:0,speed:20,heading:0};
  for(let i=0;i<120;i++)driveStep(drift,{left:true,handbrake:true},1/120,()=>true);
  assert.ok(drift.speed>16);assert.ok(Math.abs(drift.heading-drift.travelHeading)>.15);
  for(let i=0;i<240;i++)driveStep(drift,{forward:true},1/120,()=>true);
  assert.ok(Math.abs(drift.heading-drift.travelHeading)<.02);assert.ok(Math.abs(drift.yawRate)<.01);
});
test('vehicle targets rebase and unsafe dismounts are refused',()=>{
  let blocked=false;const o={x:0,z:0},system=createVehicles(new Scene(),{surface:()=>4.3,obstacle:()=>blocked,origin:()=>o}),camera=new PerspectiveCamera();
  system.update(.01,new Set(),false,camera);const v=system.targets()[0].vehicle;system.enter(v);blocked=true;assert.equal(system.exit(),null);assert.equal(system.active,v);
  blocked=false;assert.ok(system.exit());assert.equal(system.active,null);o.x=1;system.update(.01,new Set(),false,camera);assert.equal(v.group.position.x,v.x-70);
});
test('complete wheel assemblies roll, front wheels steer and paused wheels freeze',()=>{
  for(const type of ['bike','car']){
    const system=createVehicles(new Scene(),{surface:()=>4.3,obstacle:()=>false,origin:()=>({x:0,z:0})}),camera=new PerspectiveCamera();
    const v=system.targets().find(t=>t.vehicle.type===type).vehicle;system.update(.01,new Set(),false,camera);system.enter(v);
    system.update(.05,new Set(['KeyW','KeyA']),true,camera);
    for(const wheel of v.wheels){assert.ok(wheel.spin.children.length>=9);assert.ok(wheel.spin.rotation.x<0);assert.equal(wheel.pivot.rotation.y,wheel.front?v.steerAngle:0);}
    const wheel=v.wheels[0],angle=wheel.spin.rotation.x;system.update(.05,new Set(),false,camera);assert.equal(wheel.spin.rotation.x,angle);
    v.speed=-1;system.update(.05,new Set(['KeyS']),true,camera);assert.ok(wheel.spin.rotation.x>angle);
  }
});
