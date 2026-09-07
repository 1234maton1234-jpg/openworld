import {rigPilot} from '../scripts/rig-pink-pilot.mjs';
import {testSession} from './auth-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {Document,NodeIO} from '@gltf-transform/core';
import {createApp} from '../server/app.mjs';
const exec=promisify(execFile);
test('GitHub token login uses verified GitHub identity and rejects invalid credentials',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'openworld-auth-')),config={dataDir:dir,production:false,url:'http://127.0.0.1:8787',adminIds:[]},{app,store}=(await createApp(config)),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));config.url='http://127.0.0.1:'+server.address().port;
  const original=globalThis.fetch;let valid=true;
  globalThis.fetch=(url,options)=>String(url)==='https://api.github.com/user'?Promise.resolve(new Response(JSON.stringify(valid?{id:12345,login:'verified-user'}:{message:'Bad credentials'}),{status:valid?200:401,headers:{'Content-Type':'application/json'}})):original(url,options);
  try{const send=()=>original(config.url+'/api/cli/login',{method:'POST',headers:{Origin:config.url,'Content-Type':'application/json'},body:JSON.stringify({githubToken:'test-only-credential',id:'someone-else'})});const response=await send();assert.equal(response.status,200);assert.equal((await response.json()).user.id,'12345');assert.ok(response.headers.get('set-cookie'));valid=false;const rejected=await send();assert.equal(rejected.status,401);assert.equal(rejected.headers.get('set-cookie'),null);
  }finally{globalThis.fetch=original;await new Promise(r=>server.close(r));(await store.close());await rm(dir,{recursive:true,force:true});}
});
test('CLI session, avatar replacement and owned draft submission work end to end',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'openworld-cli-')),config={dataDir:dir,production:false,url:'http://127.0.0.1:8787',adminIds:[]};const {app,store}=(await createApp(config)),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));config.url='http://127.0.0.1:'+server.address().port;
  const credentials=join(dir,'cli.json'),command=(...args)=>exec(process.execPath,[resolve('cli/openworld.mjs'),...args,'--server',config.url,'--config',credentials],{env:{...process.env,OPENWORLD_GITHUB_TOKEN:'test-only-credential'}});
  const original=globalThis.fetch;globalThis.fetch=(url,options)=>String(url)==='https://api.github.com/user'?Promise.resolve(new Response(JSON.stringify({id:1001,login:'test-builder'}))):original(url,options);
  try{
    const login=await command('login');assert.match(login.stdout,/test-builder/);assert.doesNotMatch(login.stdout,/csrf|town_session/);assert.match((await command('whoami')).stdout,/1001/);
    const saved=JSON.parse(await readFile(credentials,'utf8')),headers={Origin:config.url,Cookie:saved.cookie,'X-CSRF-Token':saved.csrf};
    const doc=new Document(),buffer=doc.createBuffer(),pos=doc.createAccessor().setType('VEC3').setArray(new Float32Array([-.2,0,0,.2,0,0,0,1.8,.2])).setBuffer(buffer);doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION',pos))));const bytes=await new NodeIO().writeBinary(doc),file=join(dir,'model.glb');await writeFile(file,bytes);
    const avatarDoc=await new NodeIO().readBinary(bytes);rigPilot(avatarDoc);const avatarFile=join(dir,'avatar.glb');await writeFile(avatarFile,await new NodeIO().writeBinary(avatarDoc));const avatar=JSON.parse((await command('avatar','set',avatarFile)).stdout);assert.equal((await fetch(config.url+avatar.url)).status,200);assert.equal((await (await fetch(config.url+'/api/avatar',{headers})).json()).url,avatar.url);
    assert.equal((await fetch(config.url+'/api/avatar',{method:'PUT',headers:{Origin:config.url,'Content-Type':'model/gltf-binary'},body:bytes})).status,401);
    const vehicle=JSON.parse((await command('vehicle','set',file)).stdout);assert.equal(vehicle.category,'car');assert.equal((await fetch(config.url+vehicle.url)).status,200);assert.equal((await (await fetch(config.url+'/api/vehicle',{headers})).json()).id,vehicle.id);
    assert.equal((await fetch(config.url+'/api/vehicle',{method:'PUT',headers:{Origin:config.url,'Content-Type':'model/gltf-binary'},body:bytes})).status,401);
    assert.equal((await fetch(config.url+'/api/vehicle',{method:'PUT',headers:{...headers,'X-CSRF-Token':'bad','Content-Type':'model/gltf-binary'},body:bytes})).status,403);
    const oversized=await new NodeIO().readBinary(bytes);oversized.getRoot().listNodes()[0].setScale([20,1,1]);assert.equal((await fetch(config.url+'/api/vehicle',{method:'PUT',headers:{...headers,'Content-Type':'model/gltf-binary'},body:await new NodeIO().writeBinary(oversized)})).status,400);
    for(const category of ['plane','boat']){
      const extra=JSON.parse((await command('vehicle','set',file,'--category',category)).stdout);assert.equal(extra.category,category);
      assert.equal((await (await fetch(config.url+'/api/vehicle?category='+category,{headers})).json()).id,extra.id);
      assert.equal((await fetch(config.url+extra.url)).status,200);
      assert.equal((await (await fetch(config.url+'/api/vehicle',{headers})).json()).id,vehicle.id);
    }
    const widePlane=await fetch(config.url+'/api/vehicle?category=plane',{method:'PUT',headers:{...headers,'Content-Type':'model/gltf-binary'},body:await new NodeIO().writeBinary(oversized)});assert.equal(widePlane.status,200);
    assert.equal((await fetch(config.url+'/api/vehicle?category=boat',{method:'PUT',headers:{...headers,'Content-Type':'model/gltf-binary'},body:await new NodeIO().writeBinary(oversized)})).status,400);
    assert.equal((await fetch(config.url+'/api/vehicle?category=__proto__',{headers})).status,400);
    let polygon;for(const lot of (await store.planner.around(0,0)).lots){const x=Math.round(lot.cx/2)*2,z=Math.round(lot.cz/2)*2,p=[[x-16,z-16],[x+16,z-16],[x+16,z+16],[x-16,z+16]];try{(await store.checkLand(p));polygon=p;break;}catch{}}assert.ok(polygon);(await store.claimLand('1001',polygon));
    const draft=JSON.parse((await command('plot','upload',file,'--title','Test model')).stdout);assert.equal(draft.status,'draft');assert.equal((await store.getSubmission(draft.id)),undefined);assert.equal((await fetch(config.url+'/assets/'+draft.id+'.glb')).status,404);
    const visitor=(await testSession(store,'1002')),other={Origin:config.url,Cookie:visitor.cookie,'X-CSRF-Token':visitor.csrf};
    assert.equal((await (await fetch(config.url+'/api/vehicle',{headers:other})).json()).id,null);
    assert.equal((await fetch(config.url+'/api/cli/plots/'+draft.id+'/submit',{method:'POST',headers:other})).status,404);
    assert.equal((await fetch(config.url+'/api/cli/plots/'+draft.id+'/submit',{method:'POST',headers:{...headers,'X-CSRF-Token':'bad'}})).status,403);
    assert.equal(JSON.parse((await command('plot','submit',draft.id)).stdout).status,'pending');assert.equal((await store.getPlot('1001')).published,null);
    await assert.rejects(command('plot','submit',draft.id));
    const next=JSON.parse((await command('plot','upload',file,'--title','Next version')).stdout);await assert.rejects(command('plot','submit',next.id));assert.ok((await store.db.prepare('SELECT 1 FROM model_drafts WHERE id=?').get(next.id)));
    await command('logout');await assert.rejects(readFile(credentials));assert.equal((await fetch(config.url+'/api/mine',{headers})).status,401);
    await command('login');(await store.db.prepare('UPDATE sessions SET expires=0').run());await assert.rejects(command('whoami'),/会话已过期/);
  }finally{globalThis.fetch=original;await new Promise(r=>server.close(r));(await store.close());await rm(dir,{recursive:true,force:true});}
});
