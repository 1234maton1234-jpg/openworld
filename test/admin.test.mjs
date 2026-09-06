import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
import {testSession} from './auth-fixture.mjs';

test('admin pages and review history enforce account ID and CSRF',async()=>{
  const data=mkdtempSync(join(tmpdir(),'world-admin-')),config={dataDir:data,url:'http://127.0.0.1',adminIds:['147692760'],clientId:'test',clientSecret:'test'};
  const {app,store}=await createApp(config),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port;config.url=base;
  const call=(path,options={})=>fetch(base+path,{redirect:'manual',...options,headers:{Origin:base,...options.headers}});
  try{
    for(const path of ['/admin','/admin.html']){const r=await call(path);assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/auth/github?returnTo=admin');}
    const admin=await testSession(store,'147692760'),other=await testSession(store,'2002');
    await store.upsertUser('2002','tamikip');
    assert.equal((await call('/admin',{headers:{Cookie:other.cookie}})).status,403);
    assert.equal((await call('/api/admin/submissions',{headers:{Cookie:other.cookie}})).status,403);
    const page=await call('/admin',{headers:{Cookie:admin.cookie}});assert.equal(page.status,200);assert.match(await page.text(),/审核后台/);assert.equal(page.headers.get('cache-control'),'no-store');
    await store.claim('2002',-7,1);
    const first=await store.submit('2002','Review item',{size:[1,2,3],triangles:1});
    const headers={Cookie:admin.cookie,'X-CSRF-Token':admin.csrf,'Content-Type':'application/json'};
    const review=body=>call('/api/admin/submissions/'+first.id+'/review',{method:'POST',headers,body:JSON.stringify(body)});
    assert.equal((await call('/api/admin/submissions/'+first.id+'/review',{method:'POST',headers:{Cookie:admin.cookie,'Content-Type':'application/json'},body:'{"approve":true,"note":""}'})).status,403);
    assert.equal((await review({approve:false,note:''})).status,400);
    assert.equal((await review({approve:false,note:'Please adjust the base'})).status,200);
    const history=await (await call('/api/admin/submissions?status=rejected',{headers})).json();assert.equal(history.length,1);assert.equal(history[0].note,'Please adjust the base');assert.equal(history[0].reviewer,'147692760');
    assert.equal((await (await call('/api/admin/submissions',{headers})).json()).length,0);
    assert.equal((await review({approve:true,note:''})).status,409);
    assert.equal((await call('/api/admin/submissions?status=bad',{headers})).status,400);
    const login=await call('/auth/github?returnTo=admin');assert.match(login.headers.get('set-cookie'),/town_return=admin/);
    const unsafe=await call('/auth/github?returnTo=https://evil.example');assert.doesNotMatch(unsafe.headers.get('set-cookie'),/town_return=https/);
  }finally{await new Promise(r=>server.close(r));await store.close();rmSync(data,{recursive:true,force:true});}
});
