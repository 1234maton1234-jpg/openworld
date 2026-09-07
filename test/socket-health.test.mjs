import test from 'node:test';
import assert from 'node:assert/strict';
import {createSocketHealth,closeReason} from '../src/socket-health.mjs';
test('WebSocket RTT requires matching pong and heartbeat failure closes stale connections',t=>{
 let tick,time=0,hidden=false;const values=[],sent=[],closed=[];
 t.mock.method(globalThis,'setInterval',fn=>{tick=fn;return 1;});t.mock.method(globalThis,'clearInterval',()=>{});
 const health=createSocketHealth({readyState:1,send:v=>sent.push(JSON.parse(v)),close:(...args)=>closed.push(args)},{update:v=>values.push(v),now:()=>time,hidden:()=>hidden});
 health.welcome();assert.equal(values.at(-1).rtt,null);time=75;health.pong({id:999});assert.equal(values.at(-1).rtt,null);health.pong({id:sent[0].id});assert.equal(values.at(-1).rtt,75);
 time=5000;tick();assert.equal(sent.length,2);hidden=true;time=60000;tick();assert.equal(closed.length,0);hidden=false;tick();assert.equal(sent.length,3);time+=10001;tick();assert.equal(closed[0][0],4000);assert.equal(values.at(-1).state,'offline');health.dispose();
});
test('handshake timeout and terminal disconnect reasons are explicit',t=>{
 let tick,time=0,code;t.mock.method(globalThis,'setInterval',fn=>{tick=fn;return 1;});t.mock.method(globalThis,'clearInterval',()=>{});
 const health=createSocketHealth({close:value=>code=value},{update(){},now:()=>time,hidden:()=>false});time=10001;tick();assert.equal(code,4000);assert.match(closeReason(4001),/其他页面/);assert.match(closeReason(4003),/重新登录/);assert.match(closeReason(1006),/未提供/);health.dispose();
});
