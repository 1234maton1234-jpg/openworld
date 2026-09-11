import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
import {testSession} from './auth-fixture.mjs';
import {minePlots,primaryPlot,remainingPlotClaims} from '../src/owned-plots.mjs';

test('mine API exposes per-account plot capacity and keeps the default limit at one',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'multi-plot-')),config={dataDir:dir,url:'http://127.0.0.1:8787',adminIds:[]},{app,store}=await createApp(config);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
  try{
    const auth=await testSession(store),headers={Cookie:auth.cookie};
    const empty=await (await fetch(base+'/api/mine',{headers})).json();
    assert.deepEqual(empty.plots,[]);assert.equal(empty.plot,null);assert.equal(empty.plotLimit,1);
    const claimed=await store.claim('1001',-7,1),mine=await (await fetch(base+'/api/mine',{headers})).json();
    assert.deepEqual(mine.plots,[claimed]);assert.deepEqual(mine.plot,claimed);assert.equal(mine.plotLimit,1);
    await assert.rejects(store.claim('1001',3,0),/只能领取一块地皮/);
  }finally{await new Promise(resolve=>server.close(resolve));await store.close();rmSync(dir,{recursive:true,force:true});}
});

test('a granted owner can claim, publish and delete plots independently',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'plot-grant-')),{store}=await createApp({dataDir:dir,url:'http://127.0.0.1:8787',adminIds:[]});
  try{
    await store.upsertUser('builder','builder');await store.setPlotLimit('builder',10);
    const lots=(await store.planner.around(0,0)).lots,firstLot=lots[0],secondLot=lots.find(row=>Math.hypot(row.cx-firstLot.cx,row.cz-firstLot.cz)>150);
    const first=await store.claim('builder',firstLot.x,firstLot.z),second=await store.claim('builder',secondLot.x,secondLot.z);
    assert.equal((await store.getPlots('builder')).length,2);assert.equal(await store.getPlotLimit('builder'),10);assert.equal(second.key,secondLot.x+','+secondLot.z);
    const submission=await store.submitToPlot('builder',second.key,'Second building',{});await store.review(submission.id,'admin',true,'');
    assert.equal((await store.getPlot('builder',first.key)).published,null);assert.equal((await store.getPlot('builder',second.key)).published,submission.id);
    await store.deletePlot('builder',second.key);assert.deepEqual((await store.getPlots('builder')).map(row=>row.key),[first.key]);assert.equal(await store.getSubmission(submission.id),undefined);
  }finally{await store.close();rmSync(dir,{recursive:true,force:true});}
});

test('a configured territory-name grant persists on its unique owner',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'named-plot-grant-'));let first,second,third;
  try{
    ({store:first}=await createApp({dataDir:dir,url:'http://127.0.0.1:8787',adminIds:[]}));await first.upsertUser('luochuan','luochuan');await first.db.prepare("INSERT INTO plots(x,z,owner,cx,cz,elevation,name) VALUES (1,1,?,70,70,4.3,?)").run('luochuan','洛川大厦二期');await first.close();first=null;
    ({store:second}=await createApp({dataDir:dir,url:'http://127.0.0.1:8787',adminIds:[],plotGrants:[{name:'洛川大厦二期',limit:10}]}));assert.equal(await second.getPlotLimit('luochuan'),10);assert.equal(await second.getPlotLimit('someone-else'),1);await second.db.prepare('UPDATE plots SET name=? WHERE owner=?').run('新名字','luochuan');await second.close();second=null;
    ({store:third}=await createApp({dataDir:dir,url:'http://127.0.0.1:8787',adminIds:[],plotGrants:[{name:'洛川大厦二期',limit:10}]}));assert.equal(await third.getPlotLimit('luochuan'),10);
  }finally{await first?.close();await second?.close();await third?.close();rmSync(dir,{recursive:true,force:true});}
});

test('owned plot compatibility accepts legacy and plural responses',()=>{
  const first={x:1,z:2,area:256},second={x:3,z:4,area:512};
  assert.deepEqual(minePlots({plot:first}),[first]);
  assert.deepEqual(minePlots({plot:first,plots:[first,second]}),[first,second]);
  assert.equal(primaryPlot({plots:[first,second]}),first);
  assert.equal(remainingPlotClaims({plots:[first],plotLimit:1}),0);
  assert.equal(remainingPlotClaims({plots:[first],plotLimit:3}),2);
});
