import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import pg from 'pg';
import {createApp} from '../server/app.mjs';
import {createStore} from '../server/store.mjs';
import {testSession} from './auth-fixture.mjs';

test('PostgreSQL persists the world and enforces concurrent claims, review and OAuth redemption',{skip:!process.env.TEST_DATABASE_URL},async()=>{
  const schema='test_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});
  const source=new URL(process.env.TEST_DATABASE_URL);source.searchParams.set('options','-c search_path='+schema);
  const dir=mkdtempSync(join(tmpdir(),'openworld-pg-'));let store,second,server;
  try{
    await admin.query('CREATE SCHEMA '+schema);
    const config={dataDir:dir,databaseUrl:source.href,url:'http://127.0.0.1',adminIds:['1001'],clientId:'test',clientSecret:'test'};
    const instance=await createApp(config);store=instance.store;
    second=await createStore(source.href);
    const owner=await testSession(store),visitor=await testSession(second,'1002');
    assert.equal(store.db.postgres,true);
    assert.equal((await store.db.prepare("SELECT '?; INSERT OR IGNORE user INTEGER REAL' AS value, ? AS input").get("quote';?value")).input,"quote';?value");
    await store.db.prepare('INSERT INTO plots(x,z,owner) VALUES (?,?,?)').run(3000000000,-3000000000,'1002');
    assert.equal((await store.getPlot('1002')).x,3000000000);await store.deletePlot('1002');
    const results=await Promise.allSettled([store.claim('1001',-7,1),second.claim('1002',-7,1)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
    const winner=results.find(r=>r.status==='fulfilled').value.owner;
    if(winner!=='1001'){await second.deletePlot(winner);await store.claim('1001',-7,1);}
    const region=await store.planner.region(-1,0);
    assert.deepEqual(await second.planner.region(-1,0),region);
    await assert.rejects(store.transaction(async()=>{await store.db.prepare('UPDATE plots SET name=? WHERE owner=?').run('rollback','1001');throw new Error('abort');}),/abort/);
    assert.equal((await second.getPlot('1001')).name,'');
    const submissions=await Promise.allSettled([store.submit('1001','A',{}),second.submit('1001','B',{})]);
    assert.equal(submissions.filter(r=>r.status==='fulfilled').length,1);
    const submission=submissions.find(r=>r.status==='fulfilled').value;
    assert.equal(typeof submission.created,'number');
    const reviews=await Promise.allSettled([store.review(submission.id,'1001',true),second.review(submission.id,'1001',false)]);
    assert.equal(reviews.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(reviews.find(r=>r.status==='rejected').reason.status,409);
    await store.db.prepare('UPDATE plots SET name=?,description=? WHERE owner=?').run('测试地皮','Persistent town','1001');
    await second.close();second=await createStore(source.href);
    assert.equal((await second.getPlot('1001')).name,'测试地皮');
    assert.equal((await second.world(-7,1,1))[0].description,'Persistent town');
    const rates=await Promise.allSettled(Array.from({length:10},()=>store.rate('concurrent',3)));
    assert.equal(rates.filter(r=>r.status==='fulfilled').length,3);
    server=instance.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));config.url='http://127.0.0.1:'+server.address().port;
    const post=(path,body,auth)=>fetch(config.url+path,{method:'POST',headers:{Origin:config.url,'Content-Type':'application/json',...(auth?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{})},body:JSON.stringify(body)});
    assert.equal((await fetch(config.url+'/health')).status,200);
    const session=await (await fetch(config.url+'/api/session',{headers:{Cookie:owner.cookie}})).json();assert.equal(session.user.admin,true);
    assert.equal((await fetch(config.url+'/api/mine',{headers:{Cookie:visitor.cookie}})).status,200);
    const request=await (await post('/api/cli/authorize/start',{})).json();
    assert.equal((await post('/api/cli/authorize/confirm',{code:request.code,approve:true},owner)).status,200);
    const polls=await Promise.all([post('/api/cli/authorize/poll',{secret:request.secret}),post('/api/cli/authorize/poll',{secret:request.secret})]);
    assert.deepEqual(polls.map(r=>r.status).sort(),[200,410]);
    assert.equal((await polls.find(r=>r.status===200).json()).user.id,'1001');
    await store.db.prepare('DELETE FROM submissions WHERE owner=?').run('1001');
    await store.db.prepare('UPDATE plots SET published=NULL WHERE owner=?').run('1001');
    const upload=await fetch(config.url+'/api/cli/plots/upload?title=Test',{method:'POST',headers:{Origin:config.url,Cookie:owner.cookie,'X-CSRF-Token':owner.csrf,'Content-Type':'model/gltf-binary'},body:readFileSync('public/example-building.glb')});
    assert.equal(upload.status,201);const draft=await upload.json();
    assert.equal((await post('/api/cli/plots/'+draft.id+'/submit',{},owner)).status,201);
    assert.equal((await post('/api/admin/submissions/'+draft.id+'/review',{approve:true,note:''},owner)).status,200);
    assert.equal((await fetch(config.url+'/assets/'+draft.id+'.glb')).status,200);
    const removed=await fetch(config.url+'/api/plots/mine',{method:'DELETE',headers:{Origin:config.url,Cookie:owner.cookie,'X-CSRF-Token':owner.csrf}});assert.equal(removed.status,200);
    assert.equal(await second.getPlot('1001'),undefined);
    assert.equal((await fetch(config.url+'/assets/'+draft.id+'.glb')).status,404);
    let polygon;
    for(const lot of (await store.planner.around(0,0)).lots){
      const x=Math.round(lot.cx/2)*2,z=Math.round(lot.cz/2)*2,p=[[x-16,z-16],[x+16,z-16],[x+16,z+16],[x-16,z+16]];
      try{await store.checkLand(p);await store.checkLand(p.map(([x,z])=>[x+2,z]));polygon=p;break;}catch{}
    }
    assert.ok(polygon);
    const claims=await Promise.allSettled([store.claimLand('1001',polygon),second.claimLand('1002',polygon.map(([x,z])=>[x+2,z]))]);
    assert.equal(claims.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(claims.find(r=>r.status==='rejected').reason.status,409);
  }finally{
    if(server)await new Promise(r=>server.close(r));await second?.close();await store?.close();
    await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end();rmSync(dir,{recursive:true,force:true});
  }
});
