import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {WebSocket} from 'ws';
import {createApp} from '../server/app.mjs';
import {installMultiplayer} from '../server/multiplayer.mjs';
import {testSession} from './auth-fixture.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {playerPose,blendPose} from '../shared/player-state.mjs';

test('presence validates coordinates and interpolates wrapped angles',()=>{
  assert.equal(playerPose({x:Infinity,y:0,z:0,yaw:0}),null);
  assert.equal(playerPose({x:0,y:0,z:0,yaw:NaN}),null);
  const p=playerPose({x:0,y:4,z:0,yaw:0,name:'fake',vehicleType:'plane'});assert.equal(p.name,undefined);assert.equal(p.vehicleType,null);
  const p2=blendPose({...p,yaw:Math.PI-.1},{...p,x:10,yaw:-Math.PI+.1},.5);assert.equal(p2.x,5);assert.ok(Math.abs(p2.yaw-Math.PI)<.001);
  assert.equal(blendPose(p,{...p,x:1000},.1).x,1000);
});
test('one shared world broadcasts verified identities, proximity and disconnects',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'world-online-')),config={dataDir:dir,url:'http://127.0.0.1',adminIds:[]};
  const {app,store}=await createApp(config),server=createServer(app),hub=installMultiplayer(server,store,config),clients=[];
  await new Promise(r=>server.listen(0,'127.0.0.1',r));config.url='http://127.0.0.1:'+server.address().port;
  const connect=async cookie=>{const ws=new WebSocket(config.url.replace('http','ws')+'/realtime',{headers:{Origin:config.url,...(cookie?{Cookie:cookie}:{})}});clients.push(ws);const messages=[];ws.on('message',v=>messages.push(JSON.parse(v)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j);});return {ws,messages};};
  const wait=async predicate=>{const end=Date.now()+4000;while(Date.now()<end){if(predicate())return;await new Promise(r=>setTimeout(r,25));}assert.fail('Presence update timed out');};
  try{
    config.allowedOrigins=['https://world.example'];
    const alias=new WebSocket(config.url.replace('http','ws')+'/realtime',{origin:'https://world.example'});clients.push(alias);const aliasMessages=[];alias.on('message',value=>aliasMessages.push(JSON.parse(value)));await new Promise((r,j)=>{alias.once('open',r);alias.once('error',j);});alias.send(JSON.stringify({type:'ping',id:42}));await wait(()=>aliasMessages.some(m=>m.type==='pong'&&m.id===42));assert.ok(aliasMessages.some(m=>m.type==='welcome'));alias.close();
    const auth=await testSession(store),a=await connect(auth.cookie),b=await connect();
    const send=(c,x,extra={})=>c.ws.send(JSON.stringify({type:'pose',pose:{x,y:4.3,z:48,yaw:0,active:true,...extra},name:'Imposter'}));
    send(a,0);send(b,3);await wait(()=>b.messages.some(m=>m.type==='snapshot'&&m.players.length===1));
    const other=b.messages.filter(m=>m.type==='snapshot').at(-1).players[0];assert.equal(other.name,'test-user-1001');assert.notEqual(other.name,'Imposter');
    const replacement=await connect(auth.cookie);await wait(()=>a.ws.readyState===WebSocket.CLOSED);assert.equal(a.ws._closeCode,4001);
    await wait(()=>replacement.messages.some(m=>m.type==='welcome'));assert.equal(replacement.messages.find(m=>m.type==='welcome').position.x,0);
    a.ws=replacement.ws;a.messages=replacement.messages;
    send(a,6,{moving:true,vehicleType:'bike'});await wait(()=>b.messages.some(m=>m.players?.some(p=>p.x===6&&p.vehicleType==='bike')));
    send(a,1000);await wait(()=>b.messages.filter(m=>m.type==='snapshot').at(-1)?.players.length===0);
    send(a,0);await wait(()=>b.messages.filter(m=>m.type==='snapshot').at(-1)?.players.length===1);
    send(a,27,{vehicleType:'car'});await wait(()=>b.messages.some(m=>m.players?.some(p=>p.x===27)));
    send(a,999,{active:false});
    a.ws.close();await wait(()=>b.messages.filter(m=>m.type==='snapshot').at(-1)?.players.length===0);
    const returned=await connect(auth.cookie);await wait(()=>returned.messages.some(m=>m.type==='welcome'));const welcome=returned.messages.find(m=>m.type==='welcome');assert.equal(welcome.position.x,27);assert.equal(welcome.userId,'1001');
    assert.equal(b.messages.find(m=>m.type==='welcome').position,null);
    send(returned,1000,{personalCar:{x:4,y:4.3,z:48,yaw:0,phase:0,steer:0,driving:false},carModel:'forged'});await wait(()=>b.messages.some(m=>m.players?.some(p=>p.personalCar?.x===4)));const parked=b.messages.filter(m=>m.players?.some(p=>p.personalCar)).at(-1).players.find(p=>p.personalCar);assert.equal(parked.carModel,null);
    returned.ws.close();await wait(()=>b.messages.filter(m=>m.type==='snapshot').at(-1)?.players.length===0);
    const driver=await connect(auth.cookie);await wait(()=>driver.messages.some(m=>m.type==='welcome'));const driverId=driver.messages.find(m=>m.type==='welcome').id;
    send(driver,0,{personalCar:{x:0,y:4.3,z:48,yaw:0,driving:true}});send(b,1);
    await wait(()=>b.messages.filter(m=>m.type==='snapshot').at(-1)?.players.some(p=>p.id===driverId));
    b.ws.send(JSON.stringify({type:'ride-enter',owner:driverId}));await wait(()=>b.messages.some(m=>m.type==='ride'));assert.equal(b.messages.find(m=>m.type==='ride').ride.seat,1);
    send(b,1000);send(driver,10,{personalCar:{x:10,y:4.3,z:48,yaw:0,driving:true}});
    await wait(()=>b.messages.some(m=>m.type==='ride'&&m.ride.pose.x===10.35));
    await wait(()=>driver.messages.some(m=>m.players?.some(p=>p.ride?.owner===driverId&&p.x===10.35)));
    driver.ws.close();await wait(()=>b.messages.some(m=>m.type==='ride-end'));assert.equal(b.messages.find(m=>m.type==='ride-end').position.x,10.35);
    const malformed=await connect();malformed.ws.send(JSON.stringify({type:'pose',pose:{x:'fake',y:4,z:0,yaw:0}}));await wait(()=>malformed.ws.readyState===WebSocket.CLOSED);assert.equal(malformed.ws._closeCode,1008);
    const denied=new WebSocket(config.url.replace('http','ws')+'/realtime',{headers:{Origin:'https://untrusted.example'}});clients.push(denied);await new Promise(r=>denied.once('error',r));
  }finally{for(const ws of clients)ws.terminate();await hub.close();await new Promise(r=>server.close(r));await store.close();rmSync(dir,{recursive:true,force:true});}
});
