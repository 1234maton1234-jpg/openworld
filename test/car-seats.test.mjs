import test from 'node:test';
import assert from 'node:assert/strict';
import {carSeats,carSeatPose} from '../shared/car-seats.mjs';
import {createCarRides} from '../server/car-rides.mjs';
import {Document,NodeIO} from '@gltf-transform/core';
import {validateModel} from '../server/validate.mjs';
test('vehicle uploads validate and retain declared seat layouts',async()=>{
  const d=new Document(),buffer=d.createBuffer(),position=d.createAccessor().setType('VEC3').setArray(new Float32Array([-.9,0,-2,.9,0,-2,0,1.8,2])).setBuffer(buffer);
  const node=d.createNode().setMesh(d.createMesh().addPrimitive(d.createPrimitive().setAttribute('POSITION',position)));d.createScene().addChild(node);
  const io=new NodeIO(),validate=async()=>validateModel(Buffer.from(await io.writeBinary(d)),{width:1.9,depth:4.1},{vehicle:true});
  node.setExtras({vehicle:{seats:[[0,.65,0]]}});assert.deepEqual((await validate()).vehicleSeats,[[0,.65,0]]);
  node.setExtras({vehicle:{seats:carSeats()}});assert.equal((await validate()).vehicleSeats.length,2);
  node.setExtras({vehicle:{seats:[[0,.65,0],[.1,.65,0]]}});await assert.rejects(validate,/相隔/);
  node.setExtras({vehicle:{seats:[[0,.65,0],[.5,.65,0],[-.5,.65,0]]}});await assert.rejects(validate,/1、2 或 4/);
});
test('seat layouts accept 1/2/4 places and reject overlaps and invalid coordinates',()=>{
  assert.equal(carSeats().length,2);assert.equal(carSeats([[0,.65,0]]).length,1);
  assert.throws(()=>carSeats([[0,.6,0],[.1,.6,0]]),/相隔/);
  assert.throws(()=>carSeats([[0,.6,0],[.5,.6,0],[-.5,.6,0]]),/1、2 或 4/);
  assert.throws(()=>carSeats([[0,Infinity,0]]),/坐标/);
  const p=carSeatPose({x:100,y:2,z:200,yaw:Math.PI/2},[.5,.65,1]);assert.equal(p.x,101);assert.equal(p.z,199.5);
});
test('server reserves passenger seats, follows cars and releases occupancy',()=>{
  const owner={id:'owner',updated:Date.now(),seats:carSeats(),pose:{personalCar:{x:0,y:1,z:0,yaw:0}}},a={id:'a',pose:{active:true,x:1,y:1,z:0}},b={id:'b',pose:{active:true,x:1,y:1,z:0}},peers=new Map([['owner',owner],['a',a],['b',b]]),rides=createCarRides(peers);
  assert.equal(rides.enter(a,'owner').seat,1);assert.throws(()=>rides.enter(b,'owner'),/满员/);
  owner.pose.personalCar.x=30;assert.equal(rides.update(a).pose.x,30.35);
  rides.leave(a);b.pose.x=30;assert.equal(rides.enter(b,'owner').seat,1);
  peers.delete('owner');assert.equal(rides.update(b),null);assert.equal(rides.leave(b).x,30.35);
});
test('one seat prevents passengers, four seats reserve three distinct passenger slots',()=>{
  const owner={id:'owner',updated:Date.now(),seats:carSeats([[0,.65,0]]),pose:{personalCar:{x:0,y:1,z:0,yaw:0}}};
  const guests=Array.from({length:4},(_,i)=>({id:String(i),pose:{active:true,x:1,y:1,z:0}})),peers=new Map([['owner',owner],...guests.map(p=>[p.id,p])]),rides=createCarRides(peers);
  assert.throws(()=>rides.enter(guests[0],'owner'),/满员/);
  owner.seats=carSeats([[-.35,.65,-.3],[.35,.65,-.3],[-.35,.65,.6],[.35,.65,.6]]);
  assert.deepEqual(guests.slice(0,3).map(p=>rides.enter(p,'owner').seat),[1,2,3]);assert.throws(()=>rides.enter(guests[3],'owner'),/满员/);
  rides.leave(guests[0]);owner.carSpeed=10;assert.throws(()=>rides.enter(guests[0],'owner'),/停稳/);
  owner.carSpeed=0;guests[0].pose={active:true,x:30,y:1,z:0};assert.throws(()=>rides.enter(guests[0],'owner'),/靠近/);
  owner.pose.personalCar=null;assert.equal(rides.update(guests[1]),null);
});
