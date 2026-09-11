import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
import {testSession} from './auth-fixture.mjs';
import {minePlots,primaryPlot,remainingPlotClaims} from '../src/owned-plots.mjs';

test('mine API exposes a plural contract while the current claim limit remains one',async()=>{
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

test('owned plot compatibility accepts legacy and plural responses',()=>{
  const first={x:1,z:2,area:256},second={x:3,z:4,area:512};
  assert.deepEqual(minePlots({plot:first}),[first]);
  assert.deepEqual(minePlots({plot:first,plots:[first,second]}),[first,second]);
  assert.equal(primaryPlot({plots:[first,second]}),first);
  assert.equal(remainingPlotClaims({plots:[first],plotLimit:1}),0);
  assert.equal(remainingPlotClaims({plots:[first],plotLimit:3}),2);
});
