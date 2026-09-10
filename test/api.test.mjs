import {testSession} from './auth-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
import {Document,NodeIO} from '@gltf-transform/core';
test('authenticated claim, private submission, admin review and public visibility',async()=>{
  const data=mkdtempSync(join(tmpdir(),'town-test-')),config={dataDir:data,production:false,url:'http://127.0.0.1:8787',adminIds:['1001']};
  const {app,store}=(await createApp(config)),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
  async function call(path,options={}){return fetch(base+path,{...options,headers:{Origin:config.url,...options.headers}});}
  try{
    const landing=await (await call('/')).text();assert.ok(landing.includes('/landing.css'));assert.ok(!landing.includes('/app.js'));
    const game=await (await call('/game')).text(),gameSource=readFileSync(new URL('../src/main.mjs',import.meta.url),'utf8');assert.ok(game.includes('id="world"'));assert.ok(game.includes('/app.js'));assert.ok(!game.includes('id="model-file"'));assert.ok(!game.includes('id="upload-form"'));assert.match(game,/只能通过 openworld CLI 上传/);assert.ok(!gameSource.includes('上传载具模型'));assert.ok(!gameSource.includes("vehicleFile.type='file'"));
    const oauth=await call('/auth/github',{redirect:'manual'});assert.equal(oauth.headers.get('location'),'/game?auth=not-configured');
    assert.equal((await call('/api/plots/claim',{method:'POST'})).status,401);
    const auth=(await testSession(store)),cookie=auth.cookie;const headers={Cookie:cookie,'X-CSRF-Token':auth.csrf,'Content-Type':'application/json'};
    assert.equal((await call('/api/plots/claim',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({x:-7,z:1})})).status,403);
    assert.equal((await call('/api/plots/claim',{method:'POST',headers:{...headers,Origin:'https://evil.example'},body:'{}'})).status,403);
    assert.equal((await call('/api/plots/claim',{method:'POST',headers,body:JSON.stringify({x:-7,z:1})})).status,201);
    const d=new Document(),b=d.createBuffer(),p=d.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0,8,0,0,0,8,8])).setBuffer(b);d.createScene().addChild(d.createNode().setMesh(d.createMesh().addPrimitive(d.createPrimitive().setAttribute('POSITION',p))));
    const bytes=await new NodeIO().writeBinary(d);
    const disabledUpload=await call('/api/submissions?title=Disabled',{method:'POST',headers:{...headers,'Content-Type':'model/gltf-binary'},body:bytes});assert.equal(disabledUpload.status,410);assert.match((await disabledUpload.json()).error,/CLI/);
    const uploaded=await call('/api/cli/plots/upload?title=Test',{method:'POST',headers:{...headers,'Content-Type':'model/gltf-binary'},body:bytes});const draft=await uploaded.json();assert.equal(uploaded.status,201,JSON.stringify(draft));
    const submitted=await call('/api/cli/plots/'+draft.id+'/submit',{method:'POST',headers});const row=await submitted.json();assert.equal(submitted.status,201,JSON.stringify(row));
    assert.equal((await call('/assets/'+row.id+'.glb')).status,404);assert.equal((await call('/assets/'+row.id+'.glb',{headers:{Cookie:cookie}})).status,200);
    const visitor=(await testSession(store,'1002')),visitorCookie=visitor.cookie;
    assert.equal((await call('/api/admin/submissions/'+row.id+'/review',{method:'POST',headers:{Cookie:visitorCookie,'X-CSRF-Token':visitor.csrf,'Content-Type':'application/json'},body:JSON.stringify({approve:true,note:''})})).status,403);
    assert.equal((await call('/api/admin/submissions/'+row.id+'/review',{method:'POST',headers,body:JSON.stringify({approve:true,note:''})})).status,200);
    assert.equal((await call('/assets/'+row.id+'.glb')).status,200);
    const replacementUpload=await call('/api/cli/plots/upload?title=Replacement',{method:'POST',headers:{...headers,'Content-Type':'model/gltf-binary'},body:bytes}),replacementDraft=await replacementUpload.json();assert.equal(replacementUpload.status,201);
    const replacementSubmit=await call('/api/cli/plots/'+replacementDraft.id+'/submit',{method:'POST',headers}),replacement=await replacementSubmit.json();assert.equal(replacementSubmit.status,201);
    assert.equal((await call('/api/admin/submissions/'+replacement.id+'/review',{method:'POST',headers,body:JSON.stringify({approve:true,note:''})})).status,200);
    assert.equal(await store.getSubmission(row.id),undefined);assert.equal(existsSync(join(data,'uploads',row.id+'.glb')),false);assert.equal((await call('/assets/'+row.id+'.glb')).status,404);assert.equal((await call('/assets/'+replacement.id+'.glb')).status,200);
    const world=await (await call('/api/world?x=-7&z=1')).json();assert.equal(world.plots[0].published,replacement.id);
    assert.equal((await call('/auth/github/callback?state=bad&code=bad',{redirect:'manual'})).status,302);
  }finally{await new Promise(r=>server.close(r));(await store.close());rmSync(data,{recursive:true,force:true});}
});
test('production requires OAuth configuration',async ()=>{(await assert.rejects(async ()=>(await createApp({production:true,demo:true,url:'https://example.com',adminIds:[]})),/Production requires/));});
test('production requires PostgreSQL instead of falling back to SQLite',async()=>{
  await assert.rejects(createApp({production:true,url:'https://example.com',adminIds:['1'],clientId:'test',clientSecret:'test'}),/PostgreSQL DATABASE_URL/);
});
