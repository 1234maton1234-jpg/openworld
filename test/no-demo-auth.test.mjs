import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../server/app.mjs';
import {testSession} from './auth-fixture.mjs';

test('removed demo login cannot create or restore a session',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'no-demo-')),config={dataDir:dir,demo:true,production:false,url:'http://127.0.0.1:8787',adminIds:[]};
  let instance=(await createApp(config));const old=(await testSession(instance.store,'demo-owner')),real=(await testSession(instance.store));(await instance.store.close());
  instance=(await createApp(config));const server=instance.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
  try{
    const response=await fetch(base+'/api/demo-login',{method:'POST',headers:{Origin:config.url}});assert.equal(response.status,404);assert.equal(response.headers.get('set-cookie'),null);
    const session=await (await fetch(base+'/api/session',{headers:{Cookie:old.cookie}})).json();assert.equal(session.user,null);assert.equal('demo' in session,false);
    assert.equal((await (await fetch(base+'/api/session',{headers:{Cookie:real.cookie}})).json()).user.id,'1001');
    assert.ok((await instance.store.db.prepare('SELECT 1 FROM users WHERE id=?').get('demo-owner')));
  }finally{await new Promise(r=>server.close(r));(await instance.store.close());rmSync(dir,{recursive:true,force:true});}
});
