import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Group,Mesh,BoxGeometry,MeshStandardMaterial} from 'three';
import {createVehicles} from '../src/vehicles.mjs';
import {prepareCarModel} from '../src/custom-car.mjs';

test('one personal car can be summoned, recalled and safely refused at obstacles',()=>{
  let blocked=false;const scene=new Scene(),system=createVehicles(scene,{origin:()=>({x:0,z:0}),surface:()=>4.3,obstacle:()=>blocked});
  assert.equal(system.personal,null);assert.equal(system.summon(0,0,0),true);const first=system.personal;assert.equal(first.type,'car');assert.ok(first.z<0);
  assert.equal(system.summon(0,0,0),false);system.enter(first);assert.equal(system.recall(),true);assert.equal(system.active,null);assert.equal(system.personal,null);assert.equal(scene.children.includes(first.group),false);
  blocked=true;assert.equal(system.summon(0,0,0),false);assert.equal(system.personal,null);
});
test('custom car geometry is centered and wheel assemblies have animation pivots',()=>{
  const model=new Group(),body=new Mesh(new BoxGeometry(1.8,1.2,4),new MeshStandardMaterial());body.position.set(5,1,8);model.add(body);
  const wheel=new Mesh(new BoxGeometry(.2,.6,.6),new MeshStandardMaterial());wheel.name='wheel_fl';wheel.position.set(4.2,.3,6.8);model.add(wheel);
  const result=prepareCarModel(model);assert.equal(result.wheels.length,1);assert.equal(result.wheels[0].front,true);assert.equal(result.wheels[0].spin.children[0],wheel);assert.ok(result.group);
});
