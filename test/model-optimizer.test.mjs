import test from 'node:test';
import assert from 'node:assert/strict';
import {Document,NodeIO} from '@gltf-transform/core';
import {optimizeModel} from '../server/model-optimizer.mjs';
import {rigPilot} from '../scripts/rig-pink-pilot.mjs';
import {validateModel} from '../server/validate.mjs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Scene,PerspectiveCamera,Vector3} from 'three';
import {createRiggedAvatar} from '../src/rigged-avatar.mjs';
import {createModelLodManager} from '../src/model-lod.mjs';

test('optimizer reduces dense visuals while preserving node and interaction declarations',async()=>{
  const d=new Document(),buffer=d.createBuffer(),positions=[],indices=[],steps=30;
  for(let z=0;z<=steps;z++)for(let x=0;x<=steps;x++)positions.push(x/steps,Math.sin(x/steps)*.01,z/steps);
  for(let z=0;z<steps;z++)for(let x=0;x<steps;x++){const a=z*(steps+1)+x,b=a+steps+1;indices.push(a,b,a+1,a+1,b,b+1);}
  const p=d.createPrimitive().setAttribute('POSITION',d.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer)).setIndices(d.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer));
  const extras={vehicle:{seats:[[0,.65,0]]},interaction:{type:'sit'}};d.createScene().addChild(d.createNode('wheel_fl').setExtras(extras).setMesh(d.createMesh().addPrimitive(p)));
  const io=new NodeIO(),original=await io.writeBinary(d),result=await optimizeModel(original);assert.equal(result.variants.length,3);assert.ok(result.variants[1].triangles<1800);assert.ok(result.variants[2].triangles<=result.variants[1].triangles);
  for(const variant of result.variants){const output=await io.readBinary(variant.bytes),node=output.getRoot().listNodes()[0];assert.equal(node.getName(),'wheel_fl');assert.deepEqual(node.getExtras(),extras);assert.equal(variant.sha256.length,64);}
  assert.equal((await io.readBinary(original)).getRoot().listMeshes()[0].listPrimitives()[0].getIndices().getCount(),5400);
});

test('all avatar derivatives retain skin weights and required animation clips',async()=>{
  const d=new Document(),b=d.createBuffer(),p=d.createAccessor().setType('VEC3').setArray(new Float32Array([-.1,.12,0,-.08,.23,.02,-.12,.25,0])).setBuffer(b);
  d.createScene().addChild(d.createNode().setMesh(d.createMesh().addPrimitive(d.createPrimitive().setAttribute('POSITION',p).setMaterial(d.createMaterial('dark')))));rigPilot(d);
  const result=await optimizeModel(await new NodeIO().writeBinary(d));
  for(const variant of result.variants){const metrics=await validateModel(Buffer.from(variant.bytes),{width:2,depth:2},{avatar:true});assert.ok(metrics.resources.skins>0);assert.ok(metrics.resources.animations>=5);}
  const loader=new GLTFLoader(),parse=bytes=>loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const gltf=await parse(result.variants[0].bytes),rig=createRiggedAvatar(gltf.scene,gltf.animations),scene=new Scene(),camera=new PerspectiveCamera();scene.add(gltf.scene);gltf.scene.position.z=-60;
  let mesh;gltf.scene.traverse(node=>{if(node.isSkinnedMesh)mesh=node;});const skeleton=mesh.skeleton;
  const manager=createModelLodManager({fetcher:async()=>({ok:true,json:async()=>({variants:[{level:1,url:'one'},{level:2,url:'two'}]})}),load:url=>parse(result.variants[url==='one'?1:2].bytes)});
  manager.register(gltf,'/api/avatar/rig.glb');
  let time=1000;
  for(const distance of [60,150,5,60]){
    gltf.scene.position.z=-distance;manager.update(camera,time+=400);await new Promise(r=>setTimeout(r,30));manager.update(camera,time+=400);
    assert.equal(mesh.userData.modelLod,distance>125?2:distance>50?1:0);
    assert.equal(mesh.skeleton,skeleton);gltf.scene.updateMatrixWorld(true);skeleton.update();const before=mesh.getVertexPosition(1,new Vector3());
    let movement=0;for(let i=0;i<6;i++){rig.update({moving:true,dt:.05});gltf.scene.updateMatrixWorld(true);skeleton.update();const after=mesh.getVertexPosition(1,new Vector3());assert.ok(after.toArray().every(Number.isFinite));movement=Math.max(movement,before.distanceTo(after));}assert.ok(movement>.0001,`Animation stopped at distance ${distance}, LOD ${mesh.userData.modelLod}`);
  }
  manager.dispose();rig.dispose();
});
