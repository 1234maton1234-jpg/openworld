import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Document,NodeIO} from '@gltf-transform/core';
import {r2AssetStorage,assetKey,storageConfig} from '../server/asset-storage.mjs';
import {ensureModelVariants,removeModel} from '../server/model-variants.mjs';
import {migrateAssets} from '../scripts/migrate-assets-r2.mjs';
import {migrateAssetsOnStart} from '../server/asset-migration.mjs';
import {createApp} from '../server/app.mjs';
import {testSession} from './auth-fixture.mjs';
import {rigPilot} from '../scripts/rig-pink-pilot.mjs';

function remote(){const objects=new Map(),calls=[];const client={async send(command){const {Key,Body,IfNoneMatch}=command.input;calls.push(command.constructor.name);switch(command.constructor.name){case 'PutObjectCommand':if(IfNoneMatch&&objects.has(Key))throw Error('Already exists');objects.set(Key,Buffer.from(Body));return {};case 'DeleteObjectCommand':objects.delete(Key);return {};default:if(!objects.has(Key))throw Object.assign(Error('missing'),{name:'NoSuchKey'});return {ContentLength:objects.get(Key).length,Body:Readable.from([objects.get(Key)])};}}};return {objects,calls,store:r2AssetStorage({endpoint:'https://example.r2.cloudflarestorage.com',bucket:'test-bucket',client})};}
test('R2 stores private originals and complete derivative sets and removes both',async()=>{
  const {store,objects}=remote(),d=new Document(),buffer=d.createBuffer();d.createScene().addChild(d.createNode().setMesh(d.createMesh().addPrimitive(d.createPrimitive().setAttribute('POSITION',d.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0,1,0,0,0,1,0])).setBuffer(buffer)))));
  const bytes=Buffer.from(await new NodeIO().writeBinary(d));await store.put('model.glb',bytes,{exclusive:true});assert.deepEqual(await store.read('model.glb'),bytes);await ensureModelVariants(store,'model');assert.equal(objects.size,5);assert.ok(objects.has('models/derived/model/manifest.json'));await removeModel(store,'model');assert.equal(objects.size,0);
  await assert.rejects(store.read('missing.glb'),{code:'ENOENT'});assert.throws(()=>assetKey('../secret'));assert.throws(()=>storageConfig({ASSET_STORAGE:'r2'}),/required/);assert.throws(()=>r2AssetStorage({endpoint:'https://example.com',bucket:undefined}),/bucket/);
});
test('migration verifies content, is repeatable and refuses conflicting remote files',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'ow-r2-migrate-'));t.after(()=>rm(directory,{recursive:true,force:true}));await writeFile(join(directory,'model.glb'),'example');await writeFile(join(directory,'ignore.tmp'),'ignored');const {store,objects}=remote();
  assert.deepEqual(await migrateAssets(directory,store),{planned:1,copied:0,existing:0,sourcePreserved:true});assert.equal(objects.size,0);
  assert.equal((await migrateAssets(directory,store,{execute:true})).copied,1);assert.equal((await migrateAssets(directory,store,{execute:true})).existing,1);assert.equal((await readFile(join(directory,'model.glb'))).toString(),'example');objects.set('models/model.glb',Buffer.from('different'));await assert.rejects(migrateAssets(directory,store,{execute:true}),/refusing overwrite/);
});
test('startup migration retries failure and never resurrects deleted assets after completion',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'ow-r2-start-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const {mkdir}=await import('node:fs/promises');await mkdir(join(directory,'uploads'));await writeFile(join(directory,'uploads','model.glb'),'original');
  const {store,objects}=remote();objects.set('models/model.glb',Buffer.from('conflict'));
  await assert.rejects(migrateAssetsOnStart(directory,store),/refusing overwrite/);objects.clear();
  assert.equal((await migrateAssetsOnStart(directory,store)).copied,1);await store.remove('model.glb');
  assert.equal((await migrateAssetsOnStart(directory,store)).alreadyCompleted,true);assert.equal(objects.size,0);
});
test('avatar and all vehicle uploads round-trip through R2-backed HTTP routes',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'ow-r2-http-')),remoteStore=remote(),config={dataDir:directory,production:false,url:'http://127.0.0.1:8787',adminIds:[],assetStore:remoteStore.store}, {app,store}=await createApp(config),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));config.url='http://127.0.0.1:'+server.address().port;t.after(async()=>{await new Promise(r=>server.close(r));await store.close();await rm(directory,{recursive:true,force:true});});
  const session=await testSession(store),headers={Cookie:session.cookie,Origin:config.url,'X-CSRF-Token':session.csrf,'Content-Type':'model/gltf-binary'},d=new Document(),b=d.createBuffer();d.createScene().addChild(d.createNode().setMesh(d.createMesh().addPrimitive(d.createPrimitive().setAttribute('POSITION',d.createAccessor().setType('VEC3').setArray(new Float32Array([-.2,0,0,.2,0,0,0,1.8,.2])).setBuffer(b)))));const bytes=Buffer.from(await new NodeIO().writeBinary(d));
  for(const category of ['car','plane','boat']){const response=await fetch(config.url+'/api/vehicle?category='+category,{method:'PUT',headers,body:bytes});assert.equal(response.status,200);const row=await response.json();assert.ok(remoteStore.objects.has('models/'+row.id+'.glb'));const downloaded=await fetch(config.url+row.url);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);assert.match(downloaded.headers.get('cache-control'),/immutable/);}
  rigPilot(d);const avatarBytes=Buffer.from(await new NodeIO().writeBinary(d)),avatar=await fetch(config.url+'/api/avatar',{method:'PUT',headers,body:avatarBytes});assert.equal(avatar.status,200);const row=await avatar.json();assert.deepEqual(Buffer.from(await (await fetch(config.url+row.url)).arrayBuffer()),avatarBytes);assert.ok(remoteStore.calls.includes('PutObjectCommand'));assert.ok(remoteStore.calls.includes('GetObjectCommand'));
  await store.db.prepare('INSERT INTO plots(x,z,owner,cx,cz,elevation) VALUES (0,0,?,0,0,4.3)').run('1001');
  const uploaded=await fetch(config.url+'/api/cli/plots/upload?title=R2-building',{method:'POST',headers,body:bytes});assert.equal(uploaded.status,201);const draft=await uploaded.json(),submission=await fetch(config.url+'/api/cli/plots/'+draft.id+'/submit',{method:'POST',headers});assert.equal(submission.status,201);const building=await submission.json();await ensureModelVariants(remoteStore.store,building.id);
  const buildingUrl=config.url+'/assets/'+building.id+'.glb?lod=2';assert.equal((await fetch(buildingUrl)).status,404);const ownerDownload=await fetch(buildingUrl,{headers:{Cookie:session.cookie}});assert.equal(ownerDownload.status,200);assert.equal(ownerDownload.headers.get('cache-control'),'private, no-store');await ownerDownload.arrayBuffer();
  assert.equal((await fetch(config.url+'/api/plots/mine',{method:'DELETE',headers})).status,200);assert.equal([...remoteStore.objects.keys()].some(key=>key.includes(building.id)),false);
});
