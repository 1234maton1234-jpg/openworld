import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3,Mesh,BoxGeometry,MeshBasicMaterial} from 'three';
import {createBuildingMotion,isMovingBuildingMesh} from '../src/building-motion.mjs';
function wheel(period=120){const root=new Group(),rotor=new Group(),cabin=new Group();root.userData.openworldMotion={type:'ferrisWheel',period};rotor.userData.motionPart='rotor';cabin.userData.motionPart='cabin';cabin.position.set(0,10,0);rotor.add(cabin);for(let i=1;i<4;i++){const other=cabin.clone();other.position.set(Math.sin(i*Math.PI/2)*10,Math.cos(i*Math.PI/2)*10,0);rotor.add(other);}root.add(rotor);return {root,rotor,cabin};}
test('wheel moves cabin around hub while preserving its world up direction',()=>{
  const {root,rotor,cabin}=wheel();root.rotation.y=.6;root.position.set(5,130,-3);const motion=createBuildingMotion(root);
  motion.update(0);const before=cabin.getWorldPosition(new Vector3());motion.update(30);root.updateMatrixWorld(true);
  assert.ok(cabin.getWorldPosition(new Vector3()).distanceTo(before)>10);
  const up=new Vector3(0,1,0).transformDirection(cabin.matrixWorld);assert.ok(up.distanceTo(new Vector3(0,1,0))<1e-8);
  assert.ok(Math.abs(rotor.rotation.z-Math.PI/2)<1e-8);motion.update(120);assert.ok(cabin.getWorldPosition(new Vector3()).distanceTo(before)<1e-8);
});
test('motion uses absolute time, ignores invalid metadata and leaves static geometry alone',()=>{
  for(const period of [0,NaN,1,Infinity,'120']){const {root,rotor}=wheel(period);createBuildingMotion(root).update(30);assert.equal(rotor.rotation.z,0);}
  const {root,rotor}=wheel(),mesh=new Mesh(new BoxGeometry(),new MeshBasicMaterial()),fixed=mesh.clone();rotor.add(mesh);root.add(fixed);const motion=createBuildingMotion(root);assert.ok(isMovingBuildingMesh(mesh));assert.equal(isMovingBuildingMesh(fixed),false);
  motion.update(45);const q=rotor.quaternion.clone();motion.update(NaN);assert.ok(rotor.quaternion.equals(q));motion.update(12);motion.update(45);assert.ok(rotor.quaternion.equals(q));
});
