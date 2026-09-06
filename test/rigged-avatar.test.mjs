import test from 'node:test';
import assert from 'node:assert/strict';
import {Document,NodeIO} from '@gltf-transform/core';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3} from 'three';
import {rigPilot} from '../scripts/rig-pink-pilot.mjs';
import {validateModel} from '../server/validate.mjs';
import {createRiggedAvatar} from '../src/rigged-avatar.mjs';
test('skinned avatar validates only as avatar and animation deforms vertices',async()=>{
 const d=new Document(),b=d.createBuffer(),p=d.createAccessor().setType('VEC3').setArray(new Float32Array([-.1,.12,0,-.08,.23,.02,-.12,.25,0])).setBuffer(b);d.createScene().addChild(d.createNode().setMesh(d.createMesh().addPrimitive(d.createPrimitive().setAttribute('POSITION',p).setMaterial(d.createMaterial('dark')))));rigPilot(d);const bytes=Buffer.from(await new NodeIO().writeBinary(d));
 await validateModel(bytes,{width:2,depth:2},{avatar:true});await assert.rejects(validateModel(bytes),/静态/);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');const rig=createRiggedAvatar(gltf.scene,gltf.animations);let mesh;gltf.scene.traverse(o=>{if(o.isSkinnedMesh)mesh=o;});gltf.scene.updateMatrixWorld(true);mesh.skeleton.update();const before=mesh.getVertexPosition(1,new Vector3());for(let i=0;i<6;i++)rig.update({moving:true,dt:.05});gltf.scene.updateMatrixWorld(true);mesh.skeleton.update();assert.ok(before.distanceTo(mesh.getVertexPosition(1,new Vector3()))>.001);
 for(const state of [{running:true,moving:true},{seated:true},{vehicleType:'bike',crankPhase:1}]){rig.update({...state,dt:.1});gltf.scene.updateMatrixWorld(true);mesh.skeleton.update();assert.ok(mesh.getVertexPosition(1,new Vector3()).toArray().every(Number.isFinite));}rig.dispose();
 d.getRoot().listAnimations().forEach(a=>a.dispose());await assert.rejects(validateModel(Buffer.from(await new NodeIO().writeBinary(d)),{width:2,depth:2},{avatar:true}),/idle/);
});
