import test from 'node:test';
import assert from 'node:assert/strict';
import {createModelCache} from '../src/model-cache.mjs';
test('cancelling one subscriber preserves a shared download for another',async()=>{
  let complete,downloadSignal;const cache=createModelCache({fetcher:async(url,{signal})=>{downloadSignal=signal;await new Promise(resolve=>complete=resolve);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(2)};}});
  const a=new AbortController(),b=new AbortController(),first=cache.get('shared',{signal:a.signal}),second=cache.get('shared',{signal:b.signal});a.abort();await assert.rejects(first,{name:'AbortError'});assert.equal(downloadSignal.aborted,false);complete();assert.equal((await second).byteLength,2);
});
test('last cancellation aborts the download and permits a fresh retry',async()=>{
  let calls=0,aborted=false;const cache=createModelCache({fetcher:async(url,{signal})=>{if(++calls===1)await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true}));return {ok:true,arrayBuffer:async()=>new ArrayBuffer(2)};}});
  const controller=new AbortController(),first=cache.get('shared',{signal:controller.signal});controller.abort();await assert.rejects(first,{name:'AbortError'});assert.ok(aborted);assert.equal((await cache.get('shared')).byteLength,2);assert.equal(calls,2);
});
test('cancelled queued requests never start a download',async()=>{
  let complete,calls=0;const cache=createModelCache({concurrency:1,fetcher:async()=>{calls++;await new Promise(resolve=>complete=resolve);return {ok:true,arrayBuffer:async()=>new ArrayBuffer(2)};}});
  const first=cache.get('first'),controller=new AbortController(),queued=cache.get('queued',{signal:controller.signal});controller.abort();await assert.rejects(queued,{name:'AbortError'});complete();await first;await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);assert.equal(cache.stats.queued,0);
});

test('model cache deduplicates requests, bounds concurrency and evicts least recently used bytes',async()=>{
  let running=0,peak=0,calls=0;const cache=createModelCache({maxBytes:8,concurrency:2,fetcher:async()=>{calls++;peak=Math.max(peak,++running);await new Promise(r=>setTimeout(r,5));running--;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};}});
  const one=cache.get('a');assert.equal(cache.get('a'),one);await Promise.all([one,cache.get('b'),cache.get('c')]);assert.equal(calls,3);assert.equal(peak,2);assert.equal(cache.stats.bytes,8);await cache.get('c');assert.equal(calls,3);await cache.get('a');assert.equal(calls,4);cache.clear();assert.equal(cache.stats.bytes,0);
});
test('failed downloads can retry without retaining failed cache entries',async()=>{
  let calls=0;const cache=createModelCache({fetcher:async()=>({ok:++calls>1,arrayBuffer:async()=>new ArrayBuffer(1)})});await assert.rejects(cache.get('a'));await cache.get('a');assert.equal(calls,2);
});
test('oversized streaming responses are cancelled before reading the remaining body',async()=>{
  let cancelled=false,reads=0;
  const cache=createModelCache({maxDownloadBytes:5,fetcher:async()=>({ok:true,body:{getReader:()=>({read:async()=>{reads++;return {value:new Uint8Array(3),done:false};},cancel:async()=>{cancelled=true;},releaseLock(){}})}})});
  await assert.rejects(cache.get('large'),/resource limit/);assert.equal(reads,2);assert.equal(cancelled,true);assert.equal(cache.stats.entries,0);
});
test('oversized content length is rejected without consuming the response',async()=>{
  let cancelled=false;
  const cache=createModelCache({maxDownloadBytes:5,fetcher:async()=>({ok:true,headers:new Headers({'content-length':'6'}),body:{cancel:async()=>{cancelled=true;}},arrayBuffer:()=>{throw Error('must not read');}})});
  await assert.rejects(cache.get('large'),/resource limit/);assert.equal(cancelled,true);
});
