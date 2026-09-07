import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
import {testSession} from './auth-fixture.mjs';
import {teleportCode} from '../server/teleports.mjs';

test('teleport codes normalize case and reject paths and invalid lengths',()=>{
  assert.equal(teleportCode(' SPAWN '),'spawn');assert.equal(teleportCode('锅锅之家'),'锅锅之家');assert.throws(()=>teleportCode('../admin'));assert.throws(()=>teleportCode('a'));assert.throws(()=>teleportCode('a'.repeat(25)));
});
test('spawn, ownership, unique codes, switches and deleted plots',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'teleports-')),config={dataDir:dir,url:'http://127.0.0.1',adminIds:[]},{app,store}=await createApp(config),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));config.url='http://127.0.0.1:'+server.address().port;
  try{
    const a=await testSession(store),b=await testSession(store,'1002');
    for(const [id,x] of [['1001',1],['1002',2]])await store.db.prepare('INSERT INTO plots(x,z,owner,cx,cz,elevation,name) VALUES (?,0,?,?,0,4.3,?)').run(x,id,x*70,'House');
    const put=(user,code,enabled=true)=>fetch(config.url+'/api/teleport-settings',{method:'PUT',headers:{Origin:config.url,Cookie:user.cookie,'X-CSRF-Token':user.csrf,'Content-Type':'application/json'},body:JSON.stringify({code,enabled})});
    const resolve=code=>fetch(config.url+'/api/teleports/'+encodeURIComponent(code));
    assert.deepEqual(await(await resolve('SPAWN')).json(),{code:'spawn',name:'原始出生点',x:0,z:48,yaw:0});
    const initial=await fetch(config.url+'/api/teleport-settings',{headers:{Cookie:a.cookie}});assert.deepEqual(await initial.json(),{code:'',enabled:false});
    assert.equal((await put(a,'spawn')).status,400);assert.equal((await put({...a,csrf:'bad'},'house')).status,403);
    assert.equal((await put(a,'锅锅之家')).status,200);assert.equal((await(await resolve('锅锅之家')).json()).x,70);
    assert.equal((await put(b,'锅锅之家')).status,409);assert.equal((await put(a,'锅锅之家',false)).status,200);assert.equal((await resolve('锅锅之家')).status,404);
    assert.equal((await put(a,'house')).status,200);assert.equal((await resolve('锅锅之家')).status,404);assert.equal((await resolve('HOUSE')).status,200);
    await store.deletePlot('1001');assert.equal((await resolve('house')).status,404);assert.equal((await put(b,'house')).status,200);
    assert.equal((await put(a,'new-code')).status,409);
  }finally{await new Promise(r=>server.close(r));await store.close();rmSync(dir,{recursive:true,force:true});}
});
