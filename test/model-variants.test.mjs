import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Document,NodeIO} from '@gltf-transform/core';
import {ensureModelVariants,modelManifest,serveModel} from '../server/model-variants.mjs';

test('variant jobs deduplicate, persist manifests, preserve originals and keep private cache policy',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'ow-variants-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const d=new Document(),buffer=d.createBuffer(),position=d.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0,1,0,0,0,1,0])).setBuffer(buffer);d.createScene().addChild(d.createNode().setMesh(d.createMesh().addPrimitive(d.createPrimitive().setAttribute('POSITION',position))));
  const original=Buffer.from(await new NodeIO().writeBinary(d));await writeFile(join(directory,'test.glb'),original);
  const first=ensureModelVariants(directory,'test');assert.equal(first,ensureModelVariants(directory,'test'));const result=await first;
  assert.equal(result.variants.length,3);assert.deepEqual(await readFile(join(directory,'test.glb')),original);assert.deepEqual(await modelManifest(directory,'test'),result);
  const res={headers:{},set(k,v){this.headers[k]=v;return this;},json(v){this.body=v;return this;},type(){return this;},sendFile(file){this.file=file;return this;}};
  await serveModel({path:'/assets/test.glb',query:{manifest:'1'}},res,directory,'test');assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(res.body.variants[2].url,'/assets/test.glb?lod=2');
  await serveModel({query:{lod:'2'}},res,directory,'test',{publicAsset:true});assert.match(res.headers['Cache-Control'],/immutable/);assert.equal(res.file,join(directory,'derived','test','lod2.glb'));
  assert.throws(()=>ensureModelVariants(directory,'../outside'),/Invalid/);
  await writeFile(join(directory,'derived','test','lod2.glb'),new Uint8Array(1));assert.equal(await modelManifest(directory,'test'),null);
  await serveModel({query:{lod:'2'}},res,directory,'test',{publicAsset:true});assert.equal(res.file,join(directory,'test.glb'));assert.equal(res.headers['Cache-Control'],'no-store');
  await ensureModelVariants(directory,'test');assert.equal((await modelManifest(directory,'test')).variants.length,3);
});
test('failed optimization preserves originals and backs off repeated requests',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'ow-variants-failure-'));t.after(()=>rm(directory,{recursive:true,force:true}));await writeFile(join(directory,'bad.glb'),'invalid');await assert.rejects(ensureModelVariants(directory,'bad'));await assert.rejects(ensureModelVariants(directory,'bad'),/retry later/);
  const res={headers:{},set(k,v){this.headers[k]=v;return this;},status(v){this.code=v;return this;},json(v){this.body=v;return this;},type(){return this;},sendFile(file){this.file=file;return this;}};
  await serveModel({query:{manifest:'1'}},res,directory,'bad');assert.equal(res.code,503);assert.equal(res.body.status,'failed');assert.equal(res.headers['Retry-After'],'60');assert.equal((await readFile(join(directory,'bad.glb'))).toString(),'invalid');
});
