import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
import {Document,NodeIO} from '@gltf-transform/core';
test('authenticated claim, private submission, admin review and public visibility',async()=>{
  const data=mkdtempSync(join(tmpdir(),'town-test-')),config={dataDir:data,demo:true,production:false,url:'http://127.0.0.1:8787',adminIds:[]};
  const {app,store}=createApp(config),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
  async function call(path,options={}){return fetch(base+path,{...options,headers:{Origin:config.url,...options.headers}});}
  try{
    const landing=await (await call('/')).text();assert.ok(landing.includes('/landing.css'));assert.ok(!landing.includes('/app.js'));
    const game=await (await call('/game')).text();assert.ok(game.includes('id="world"'));assert.ok(game.includes('/app.js'));
    const oauth=await call('/auth/github',{redirect:'manual'});assert.equal(oauth.headers.get('location'),'/game?auth=not-configured');
    assert.equal((await call('/api/plots/claim',{method:'POST'})).status,401);
    const login=await call('/api/demo-login',{method:'POST'}),cookie=login.headers.get('set-cookie').split(';')[0],auth=await login.json();const headers={Cookie:cookie,'X-CSRF-Token':auth.csrf,'Content-Type':'application/json'};
    assert.equal((await call('/api/plots/claim',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({x:-7,z:1})})).status,403);
    assert.equal((await call('/api/plots/claim',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'})).status,403);
    assert.equal((await call('/api/plots/claim',{method:'POST',headers,body:JSON.stringify({x:-7,z:1})})).status,201);
    const d=new Document(),b=d.createBuffer(),p=d.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0,8,0,0,0,8,8])).setBuffer(b);d.createScene().addChild(d.createNode().setMesh(d.createMesh().addPrimitive(d.createPrimitive().setAttribute('POSITION',p))));
    const uploaded=await call('/api/submissions?title=Test',{method:'POST',headers:{...headers,'Content-Type':'model/gltf-binary'},body:await new NodeIO().writeBinary(d)});const row=await uploaded.json();assert.equal(uploaded.status,201,JSON.stringify(row));
    assert.equal((await call('/assets/'+row.id+'.glb')).status,404);assert.equal((await call('/assets/'+row.id+'.glb',{headers:{Cookie:cookie}})).status,200);
    const visitorLogin=await call('/api/demo-login?role=visitor',{method:'POST'}),visitorCookie=visitorLogin.headers.get('set-cookie').split(';')[0],visitor=await visitorLogin.json();
    assert.equal((await call('/api/admin/submissions/'+row.id+'/review',{method:'POST',headers:{Cookie:visitorCookie,'X-CSRF-Token':visitor.csrf,'Content-Type':'application/json'},body:JSON.stringify({approve:true,note:''})})).status,403);
    assert.equal((await call('/api/admin/submissions/'+row.id+'/review',{method:'POST',headers,body:JSON.stringify({approve:true,note:''})})).status,200);
    assert.equal((await call('/assets/'+row.id+'.glb')).status,200);
    const world=await (await call('/api/world?x=-7&z=1')).json();assert.equal(world.plots[0].published,row.id);
    assert.equal((await call('/auth/github/callback?state=bad&code=bad',{redirect:'manual'})).status,302);
  }finally{await new Promise(r=>server.close(r));store.close();rmSync(data,{recursive:true,force:true});}
});
test('production cannot enable development login',()=>{assert.throws(()=>createApp({production:true,demo:true,url:'https://example.com',adminIds:[]}),/Production requires/);});
