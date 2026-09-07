import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {prepareDevelopmentAvatar,installDevelopmentAvatar} from '../server/development-avatar.mjs';
import {createNativeAvatarRuntime} from '../src/native-avatar.mjs';
import {readGeometry} from '../scripts/ysm/geometry.mjs';

function sample(){return {name:'test',textures:[{name:'skin',url:'data:image/png;base64,AA=='}],geometry:readGeometry({'minecraft:geometry':[{description:{texture_width:16,texture_height:16},bones:[{name:'Root',pivot:[0,0,0]},{name:'RightLeg',parent:'Root',pivot:[0,16,0],cubes:[{origin:[0,0,0],size:[4,16,4],uv:[0,0]}]},{name:'RightLowerLeg',parent:'RightLeg',pivot:[0,8,0]},{name:'LeftLeg',parent:'Root',pivot:[0,16,0]},{name:'LeftLowerLeg',parent:'LeftLeg',pivot:[0,8,0]},{name:'RightArm',parent:'Root',pivot:[0,24,0]},{name:'LeftArm',parent:'Root',pivot:[0,24,0]},{name:'RightForeArm',parent:'RightArm',pivot:[0,20,0]},{name:'LeftForeArm',parent:'LeftArm',pivot:[0,20,0]},{name:'Backdrop',parent:'Root',pivot:[0,0,0],cubes:[{origin:[0,0,0],size:[100,100,1],uv:[0,0]}]}]}]})};}
test('development avatar removes configured subtrees without mutating the source',()=>{
  const original=sample(),result=prepareDevelopmentAvatar(original,['Backdrop']);
  assert.equal(result.geometry.bones.some(b=>b.name==='Backdrop'),false);
  assert.equal(original.geometry.bones.some(b=>b.name==='Backdrop'),true);
  assert.equal(result.format,'ysm');assert.equal(result.name,'test');
  assert.throws(()=>prepareDevelopmentAvatar(original,['missing']),/Unknown/);
});
test('development avatar refuses production or non-loopback configuration before file access',async()=>{
  await assert.rejects(installDevelopmentAvatar({}, {production:true,devAvatarFile:'missing.ysm'}),/local development/);
  await assert.rejects(installDevelopmentAvatar({}, {production:false,devAvatarFile:'missing.ysm',url:'https://example.com',host:'0.0.0.0'}),/loopback/);
});
test('native avatar bones respond to walking, running, sitting and cycling',()=>{
  const data=prepareDevelopmentAvatar(sample(),['Backdrop']),material=new T.MeshBasicMaterial(),runtime=createNativeAvatarRuntime(data,material);
  const leg=()=>runtime.rig.bones.get('RightLeg').node.matrix.clone();
  runtime.update({moving:false,dt:.1});const idle=leg();
  runtime.update({moving:true,dt:.1});const walk=leg();assert.notDeepEqual(walk.elements,idle.elements);
  runtime.update({moving:true,running:true,dt:.1});assert.notDeepEqual(leg().elements,walk.elements);
  runtime.update({seated:true,dt:.1});const sit=leg();assert.notDeepEqual(sit.elements,idle.elements);
  runtime.update({vehicleType:'bike',crankPhase:0,dt:.1});const cycle=leg();runtime.update({vehicleType:'bike',crankPhase:Math.PI,dt:.1});assert.notDeepEqual(leg().elements,cycle.elements);
  assert.ok(new T.Box3().setFromObject(runtime.scene).getSize(new T.Vector3()).toArray().every(Number.isFinite));
  runtime.rig.dispose();material.dispose();
});
