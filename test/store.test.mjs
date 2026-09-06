import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../server/store.mjs';
test('claim ownership is exclusive and coordinate bounds are enforced',()=>{
  const s=createStore(':memory:');try{s.upsertUser('1','one');s.upsertUser('2','two');s.claim('1',-7,1);
    assert.throws(()=>s.claim('2',-7,1),/被领取/);assert.throws(()=>s.claim('1',3,0),/只能领取/);assert.equal(s.claim('2',0,0).owner,'2');assert.throws(()=>s.claim('2',2.5,0),/整数/);assert.throws(()=>s.claim('2',Number.MAX_SAFE_INTEGER,0),/整数/);
  }finally{s.close();}
});
test('server refuses unplanned parcels and persists a stable foundation height',()=>{const s=createStore(':memory:');try{s.upsertUser('3','three');const plan=s.planner.region(0,0),missing=Array.from({length:64},(_,i)=>({x:i%8,z:Math.floor(i/8)})).find(p=>!plan.lots.some(l=>l.x===p.x&&l.z===p.z));assert.ok(missing);assert.throws(()=>s.claim('3',missing.x,missing.z),/道路、河道或公共空间/);assert.equal(s.getPlot('3'),undefined);const row=s.claim('3',-7,1);assert.equal(row.elevation,s.planner.lot(-7,1).elevation);}finally{s.close();}});
test('only approval changes the public building; rejection preserves previous version',()=>{
  const s=createStore(':memory:');try{s.upsertUser('1','one');s.claim('1',-7,1);const a=s.submit('1','A',{});
    assert.equal(s.world(-7,1,1)[0].published,null);assert.throws(()=>s.submit('1','B',{}),/等待审核/);
    s.review(a.id,'admin',true);const b=s.submit('1','B',{});assert.equal(s.getPlot('1').published,a.id);
    s.review(b.id,'admin',false,'太暗');assert.equal(s.getPlot('1').published,a.id);assert.throws(()=>s.review(b.id,'admin',true),/已处理/);
    const c=s.submit('1','C',{});s.review(c.id,'admin',true);assert.equal(s.getPlot('1').published,c.id);assert.equal(s.getSubmission(a.id).status,'superseded');
  }finally{s.close();}
});
