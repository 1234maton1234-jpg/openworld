import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
import {createStore,ECONOMY} from '../server/store.mjs';
import {testSession} from './auth-fixture.mjs';

test('land costs one point per square metre and requires the build threshold',async()=>{
  const store=await createStore(':memory:');
  try{
    await store.upsertUser('builder','builder');
    assert.equal((await store.getUser('builder')).points,ECONOMY.initialPoints);
    const lot=(await store.planner.around(0,0)).lots[0],plot=await store.claim('builder',lot.x,lot.z);
    assert.equal((await store.getUser('builder')).points,ECONOMY.initialPoints-Math.ceil(plot.area));
    await store.deletePlot('builder',plot.key);assert.equal((await store.getUser('builder')).points,ECONOMY.initialPoints);
    await store.upsertUser('poor','poor');
    await store.db.prepare('UPDATE users SET points=? WHERE id=?').run(ECONOMY.buildThreshold-1,'poor');
    const other=(await store.planner.around(10,10)).lots[0];
    await assert.rejects(store.claim('poor',other.x,other.z),/至少需要 2500 积分/);
  }finally{await store.close();}
});

test('a signed-in visitor can like another plot once and rewards its owner',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'plot-like-')),config={dataDir:dir,url:'http://127.0.0.1:8787',adminIds:[]},{app,store}=await createApp(config);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
  try{
    await store.upsertUser('owner','owner');const lot=(await store.planner.around(0,0)).lots[0],plot=await store.claim('owner',lot.x,lot.z),before=(await store.getUser('owner')).points;
    const visitor=await testSession(store,'visitor'),headers={Origin:config.url,Cookie:visitor.cookie,'X-CSRF-Token':visitor.csrf};
    assert.equal((await fetch(`${base}/api/plots/${plot.x}/${plot.z}/like`,{method:'POST'})).status,403);
    const liked=await fetch(`${base}/api/plots/${plot.x}/${plot.z}/like`,{method:'POST',headers});assert.equal(liked.status,200);assert.deepEqual(await liked.json(),{likes:1,liked:true,reward:ECONOMY.likeReward});
    assert.equal((await store.getUser('owner')).points,before+ECONOMY.likeReward);
    assert.equal((await fetch(`${base}/api/plots/${plot.x}/${plot.z}/like`,{method:'POST',headers})).status,409);
    const owner=await testSession(store,'owner'),selfHeaders={Origin:config.url,Cookie:owner.cookie,'X-CSRF-Token':owner.csrf};
    assert.equal((await fetch(`${base}/api/plots/${plot.x}/${plot.z}/like`,{method:'POST',headers:selfHeaders})).status,409);
    const world=await (await fetch(`${base}/api/world?x=${Math.round(plot.cx/70)}&z=${Math.round(plot.cz/70)}`,{headers:{Cookie:visitor.cookie}})).json(),row=world.plots.find(item=>item.key===plot.key);
    assert.equal(row.likes,1);assert.equal(row.liked,true);
    const mine=await (await fetch(base+'/api/mine',{headers:{Cookie:owner.cookie}})).json();assert.equal(mine.points,before+ECONOMY.likeReward);
  }finally{await new Promise(resolve=>server.close(resolve));await store.close();rmSync(dir,{recursive:true,force:true});}
});

test('the game UI displays points, land cost and territory likes',()=>{
  const main=readFileSync(new URL('../src/main.mjs',import.meta.url),'utf8'),territory=readFileSync(new URL('../src/territory-info.mjs',import.meta.url),'utf8');
  assert.match(main,/\['积分',/);assert.match(main,/消耗.*积分/);assert.match(main,/createTerritoryInfo\([^;]+like:/s);
  assert.match(territory,/territory-like/);assert.match(territory,/点赞/);
});
