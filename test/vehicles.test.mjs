import test from 'node:test';
import assert from 'node:assert/strict';
import {driveStep,VEHICLES,createVehicles} from '../src/vehicles.mjs';
import {Scene,PerspectiveCamera} from 'three';
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
