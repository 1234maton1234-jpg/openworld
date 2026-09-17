import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../server/store.mjs';
test('a validated upload cannot attach to a deleted and reclaimed plot',async()=>{
  const s=await createStore(':memory:');
  try{
    await s.upsertUser('1','one');await s.db.prepare('UPDATE users SET points=9000 WHERE id=?').run('1');await s.claim('1',-7,1);const revision=s.plotRevision('1');
    await s.deletePlot('1');await s.claim('1',-7,1);
    await assert.rejects(s.submit('1','Stale',{},'stale',revision),/地皮已删除/);
    assert.equal(await s.getSubmission('stale'),undefined);
  }finally{await s.close();}
});
test('claim ownership is exclusive and coordinate bounds are enforced',async ()=>{
  const s=(await createStore(':memory:'));try{(await s.upsertUser('1','one'));(await s.upsertUser('2','two'));(await s.claim('1',-7,1));
    (await assert.rejects(async ()=>(await s.claim('2',-7,1)),/被领取/));(await assert.rejects(async ()=>(await s.claim('1',3,0)),/只能领取/));const first=(await s.getPlot('1')),lot=(await s.planner.around(0,0)).lots.find(p=>Math.hypot(p.cx-first.cx,p.cz-first.cz)>150);assert.ok(lot);assert.equal((await s.claim('2',lot.x,lot.z)).owner,'2');(await assert.rejects(async ()=>(await s.claim('2',2.5,0)),/整数/));(await assert.rejects(async ()=>(await s.claim('2',Number.MAX_SAFE_INTEGER,0)),/整数/));
  }finally{(await s.close());}
});
test('server refuses unplanned parcels and persists a stable foundation height',async ()=>{const s=(await createStore(':memory:'));try{(await s.upsertUser('3','three'));const plan=(await s.planner.region(0,0)),missing=Array.from({length:64},(_,i)=>({x:i%8,z:Math.floor(i/8)})).find(p=>!plan.lots.some(l=>l.x===p.x&&l.z===p.z));assert.ok(missing);(await assert.rejects(async ()=>(await s.claim('3',missing.x,missing.z)),/道路、河道或公共空间/));assert.equal((await s.getPlot('3')),undefined);const row=(await s.claim('3',-7,1));assert.equal(row.elevation,(await s.planner.lot(-7,1)).elevation);}finally{(await s.close());}});
test('only approval changes the public building; rejection preserves previous version',async ()=>{
  const s=(await createStore(':memory:'));try{(await s.upsertUser('1','one'));(await s.claim('1',-7,1));const a=(await s.submit('1','A',{}));
    assert.equal((await s.world(-7,1,1))[0].published,null);(await assert.rejects(async ()=>(await s.submit('1','B',{})),/等待审核/));
    (await s.review(a.id,'admin',true));const b=(await s.submit('1','B',{}));assert.equal((await s.getPlot('1')).published,a.id);
    (await s.review(b.id,'admin',false,'太暗'));assert.equal((await s.getPlot('1')).published,a.id);(await assert.rejects(async ()=>(await s.review(b.id,'admin',true)),/已处理/));
    const c=(await s.submit('1','C',{}));(await s.review(c.id,'admin',true));assert.equal((await s.getPlot('1')).published,c.id);assert.equal((await s.getSubmission(a.id)).status,'superseded');
  }finally{(await s.close());}
});
