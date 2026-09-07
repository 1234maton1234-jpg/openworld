import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as zlib from 'node:zlib';
import * as T from 'three';
import {parseYsmBinary,decodeYsm,washZstd} from '../scripts/ysm/reader.mjs';
import {readGeometry,buildModel,sampleChannel,animationSupported} from '../scripts/ysm/geometry.mjs';
import {startPreview} from '../scripts/ysm-preview.mjs';
const java=spawnSync('javac',['-version'],{windowsHide:true}).status===0&&typeof zlib.zstdDecompressSync==='function';
// Synthetic format-32 geometry sealed with the upstream OpenYSM encryptYsmFile implementation.
const fixture=Buffer.from('77u/WVNHUAADAAAASX6T0nHqyJw6lJJP69ulTt+RPq0l/TnW/HraYRi0wRdZ+wf9u8rNZaD6w4Xdl41oo49jIcK2LhyQti1luWVCV/BfKxclQCspkS9dOaXHubd9km92o6ooL5C+qYUabkJaLAJWu2AqKD0sLNQWATrIJvMcxENWZNH8fqMLGh0g+pPS/RMwfilq5Pq3ZGW0KZUiTHzsHpz4o4AEMkhWhctakS4W0sE3zhCO9hA+iHiDQi6hVEY5ytfZxYKTEgpBubcUB1WIpsMtLKJ1BJ9sDPu8byk/X7ZWBe4zv9H0RBjZwGWVrfU4w2k2Wwpgq7qKcLCA3lDOQ29C','base64');

test('YSM rejects truncated, unsupported and oversized files',{skip:!java},async()=>{
  await assert.rejects(decodeYsm(Buffer.alloc(12)),/YSM/);
  await assert.rejects(decodeYsm(Buffer.alloc(12*1024*1024+1)),/12 MB/);
  await assert.rejects(parseYsmBinary(Buffer.from([99,0,0,0])),/version|format/i);
  await assert.rejects(parseYsmBinary(Buffer.from([32,0,0,0,128])),/truncated|buffer/i);
});

test('native YSM decrypts and parses an upstream encrypted fixture',{skip:!java},async()=>{
  const raw=await decodeYsm(fixture);
  assert.equal(raw.formatVersion,32);
  assert.equal(raw.mainEntity.mainModel.bones[0].name,'Root');
  assert.deepEqual(raw.mainEntity.mainModel.bones[0].cubes[0].faces[0].positions[2],[1,1,0]);
  const corrupt=Buffer.from(fixture);corrupt[50]^=1;
  await assert.rejects(decodeYsm(corrupt),/hash mismatch/);
});

test('bone hierarchy preserves child pivots and rejects cycles',()=>{
  const geometry=readGeometry({'minecraft:geometry':[{description:{texture_width:16,texture_height:16},bones:[{name:'Root',pivot:[0,8,0],rotation:[0,0,90]},{name:'Child',parent:'Root',pivot:[0,16,0],cubes:[{origin:[0,8,0],size:[8,8,8],uv:[0,0]}]}]}]});
  const material=new T.MeshBasicMaterial(),model=buildModel(geometry,material),box=new T.Box3().setFromObject(model.root);
  assert.equal(model.triangles,12);
  assert.ok(Math.abs(box.min.x+.5)<1e-6);
  assert.ok(Math.abs(box.min.y)<1e-6);
  model.dispose();material.dispose();geometry.bones[0].parentName='Child';
  assert.throws(()=>buildModel(geometry,material),/Cyclic/);
});

test('animation pre/post boundaries and expressions are handled explicitly',()=>{
  const frames=[{timestamp:0,postData:[0,0,0]},{timestamp:1,preData:[2,2,2],postData:[5,5,5],hasPreData:true}];
  assert.deepEqual(sampleChannel(frames,.5,[0,0,0]),[1,1,1]);
  assert.deepEqual(sampleChannel(frames,1,[0,0,0]),[5,5,5]);
  assert.equal(animationSupported({length:1,boneAnimations:[{rotation:[{timestamp:0,postData:['query.foo',0,0]}]}]}),false);
  assert.equal(animationSupported({length:-1,boneAnimations:[]}),false);
});

test('user-supplied YSM renders finite geometry without conversion',{skip:!java||!process.env.OPENWORLD_YSM_SAMPLE},async()=>{
  const raw=await decodeYsm(await readFile(process.env.OPENWORLD_YSM_SAMPLE));
  const material=new T.MeshBasicMaterial(),rig=buildModel(raw.mainEntity.mainModel,material);
  assert.ok(rig.triangles>0);assert.ok(new T.Box3().setFromObject(rig.root).getSize(new T.Vector3()).toArray().every(Number.isFinite));
  const animations=Object.values(raw.mainEntity.animationFiles).flatMap(f=>Object.values(f.animations)).filter(animationSupported);
  assert.ok(animations.length>0);for(const a of animations){rig.update(a,a.length/2);assert.ok(new T.Box3().setFromObject(rig.root).getSize(new T.Vector3()).toArray().every(Number.isFinite),a.name);}
  rig.dispose();material.dispose();
});

test('YSM rejects invalid Zstandard frames before decompression',()=>{
  assert.throws(()=>washZstd(Buffer.alloc(10)),/Zstandard/);
  assert.throws(()=>washZstd(Buffer.from([40,181,47,253,32,1])),/block|truncated/i);
});

test('local preview serves native data and rejects cross-origin uploads',{skip:!java},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'openworld-ysm-'));let server;
  try{
    const path=join(dir,'fixture.ysm');await writeFile(path,fixture);server=await startPreview(path);
    const url='http://127.0.0.1:'+server.address().port;
    const page=await fetch(url);assert.equal(page.status,200);assert.match(await page.text(),/原生模型预览/);
    const response=await fetch(url+'/model');assert.equal((await response.json()).models[0].geometry.bones[0].name,'Root');
    assert.equal((await fetch(url+'/model',{method:'POST',headers:{Origin:'https://example.com'},body:fixture})).status,403);
    assert.equal((await fetch(url+'/model',{method:'POST',headers:{Origin:url},body:Buffer.from('invalid')})).status,400);
    const upload=await fetch(url+'/model',{method:'POST',headers:{Origin:url},body:fixture});assert.equal(upload.status,200);assert.equal((await upload.json()).models[0].geometry.bones[0].name,'Root');
  }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await rm(dir,{recursive:true,force:true});}
});
