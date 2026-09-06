import test from 'node:test';
import assert from 'node:assert/strict';
import {heightAt,riverX} from '../shared/terrain.mjs';
import {coordinate} from '../server/store.mjs';
test('gentle hills and wide river banks stay below a 0.4 sampled gradient',()=>{
  let steepest=0,highest=0;
  for(let z=-1800;z<=1800;z+=24)for(let x=-1600;x<=1600;x+=24){const h=heightAt(x,z);highest=Math.max(highest,h);steepest=Math.max(steepest,Math.hypot((heightAt(x+1,z)-heightAt(x-1,z))/2,(heightAt(x,z+1)-heightAt(x,z-1))/2));}
  assert.ok(highest>15&&highest<38,`height ${highest}`);assert.ok(steepest<.4,`gradient ${steepest}`);assert.ok(heightAt(riverX(300),300)<0);
});
test('exploration accepts coordinates well beyond the former world edge',()=>{for(const p of [1000001,-1000001,2000000000,-2000000000]){assert.equal(coordinate(p),p);assert.ok(Number.isFinite(heightAt(p*70,-p*70)));}assert.throws(()=>coordinate(Number.MAX_SAFE_INTEGER));});
