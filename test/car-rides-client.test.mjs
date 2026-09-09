import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene} from 'three';
import {createMultiplayer} from '../src/multiplayer.mjs';

test('client exposes passenger targets and handles boarding, leaving and disconnect',async t=>{
  const keys=['window','document','location','localStorage','WebSocket'],originals=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  t.after(()=>{for(const [k,v] of originals)v?Object.defineProperty(globalThis,k,v):delete globalThis[k];});
  const canvas={width:512,height:96,getContext:()=>new Proxy({},{get:()=>()=>{},set:()=>true})},world={dataset:{}};
  globalThis.window={addEventListener(){}};globalThis.document={hidden:false,addEventListener(){},querySelector:()=>world,createElement:()=>canvas};globalThis.location={origin:'http://localhost'};globalThis.localStorage={getItem:()=>null,setItem(){}};
  const sockets=[];class Socket{static OPEN=1;readyState=1;bufferedAmount=0;sent=[];constructor(){sockets.push(this);}send(value){this.sent.push(JSON.parse(value));}close(){}}
  Object.defineProperty(globalThis,'WebSocket',{value:Socket,configurable:true,writable:true});
  t.mock.method(globalThis,'setInterval',()=>1);t.mock.method(globalThis,'clearInterval',()=>{});t.mock.method(globalThis,'setTimeout',()=>1);t.mock.method(globalThis,'clearTimeout',()=>{});
  let starts=0,exits=0;const client=createMultiplayer(new Scene(),{origin:()=>({x:0,z:0}),onError:()=>{},onRideStart:()=>starts++,onRideEnd:()=>exits++});
  t.after(()=>client.dispose());client.setIdentity(null);const ws=sockets.at(-1),receive=message=>ws.onmessage({data:JSON.stringify(message)});
  assert.notEqual(world.dataset.multiplayer,'online');receive({type:'welcome',userId:null});assert.equal(world.dataset.multiplayer,'online');const ping=ws.sent.find(m=>m.type==='ping');receive({type:'pong',id:ping.id});assert.ok(Number(world.dataset.networkRtt)>=0);const pose={x:0,y:2,z:0,yaw:0,active:true};
  receive({type:'snapshot',players:[{...pose,id:'owner',name:'Driver',personalCar:{x:2,y:2,z:0,yaw:0,phase:0,steer:0},carSeats:[[0,.65,0],[.5,.65,0]]}]});client.update(pose,.016);
  assert.equal(client.rideTargets()[0].rideOwner,'owner');
  client.enterRide('owner');assert.equal(ws.sent.at(-1).type,'ride-enter');
  receive({type:'ride',ride:{owner:'owner',seat:1,pose:{...pose,x:2.5}}});assert.equal(starts,1);assert.equal(client.ride.pose.x,2.5);
  client.exitRide();assert.equal(ws.sent.at(-1).type,'ride-exit');receive({type:'ride-end',position:pose});assert.equal(client.ride,null);assert.equal(exits,1);
  receive({type:'ride',ride:{owner:'owner',seat:1,pose}});
  let completed=false;const leaving=client.leaveForTeleport().then(()=>completed=true);assert.equal(ws.sent.at(-1).type,'ride-exit');assert.equal(completed,false);assert.ok(client.ride);
  receive({type:'ride-end',position:pose});await leaving;assert.equal(client.ride,null);assert.equal(exits,1);assert.equal(completed,true);
  receive({type:'ride',ride:{owner:'owner',seat:1,pose}});ws.onclose({code:1006});assert.equal(client.ready,false);assert.equal(world.dataset.networkRtt,'');assert.match(world.dataset.networkReason,/未提供/);assert.equal(client.ride,null);assert.equal(client.rideTargets().length,0);assert.equal(exits,2);
});
