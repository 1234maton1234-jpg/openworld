import test from 'node:test';
import assert from 'node:assert/strict';
import {DepthGrid} from '../src/depth-grid.mjs';
test('depth grid reuses overlap and keeps the previous texture until the next is complete',()=>{
  let calls=0;const grid=new DepthGrid(33,140,(x,z)=>{calls++;return x+z;});
  grid.request(0,0,'a');assert.equal(calls,0);
  while(!grid.step(16,()=>0)){}
  assert.equal(calls,33*33);const first=grid.current;
  calls=0;grid.request(70,0,'a');assert.equal(grid.current,first);
  while(!grid.step(16,()=>0)){}
  assert.equal(calls,16*33);assert.equal(grid.current.x,70);
  assert.equal(grid.current.values[16*33+16],70);
  calls=0;grid.request(70,0,'a');assert.equal(grid.step(),false);assert.equal(calls,0);
  grid.request(70,0,'b');while(!grid.step(16,()=>0)){}assert.equal(calls,33*33);
});
test('superseded depth jobs and negative moves cannot publish stale coordinates',()=>{
  const grid=new DepthGrid(17,70,(x,z)=>x-z);grid.request(0,0,'a');
  grid.request(-70,70,'a');while(!grid.step(16,()=>0)){}
  assert.equal(grid.current.x,-70);assert.equal(grid.current.z,70);assert.equal(grid.current.values[8*17+8],-140);
});
test('depth sampling yields within the frame budget',()=>{
  let calls=0,time=0;const grid=new DepthGrid(129,560,()=>++calls);grid.request(0,0,'a');
  assert.equal(grid.step(1,()=>time++),false);assert.equal(calls,64);assert.equal(grid.current,null);
});
