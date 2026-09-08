import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Matrix4,Vector3} from 'three';
import {createGroundNavigation} from '../src/navigation-ground.mjs';

test('ground navigation is a local emissive-looking overlay with instanced direction markers',()=>{
  const scene=new Scene(),o={x:10,z:0},nav=createGroundNavigation(scene,()=>o);nav.setRoute([[700,4,0],[700,8,-70]]);
  assert.equal(nav.group.children.length,3);const arrows=nav.group.getObjectByName('navigation-arrows');assert.ok(arrows.isInstancedMesh);assert.equal(arrows.count,5);
  const m=new Matrix4();arrows.getMatrixAt(0,m);const forward=new Vector3(0,0,-1).transformDirection(m);assert.ok(forward.z<-.99);
  assert.ok(m.elements[13]>4);for(const mesh of nav.group.children){assert.ok(mesh.material.isMeshBasicMaterial);assert.equal(mesh.material.toneMapped,false);assert.equal(mesh.material.depthTest,true);assert.equal(mesh.castShadow,false);}
  for(const mesh of nav.group.children){assert.equal(mesh.material.polygonOffset,true);assert.ok(mesh.material.polygonOffsetFactor < -6);assert.ok(mesh.material.polygonOffsetUnits < -6);}
  o.x=11;nav.rebase();assert.equal(nav.group.position.x,-70);nav.setRoute([]);assert.equal(nav.group.children.length,0);assert.equal(nav.group.visible,false);nav.dispose();assert.equal(scene.children.length,0);
});
test('route replacement releases old geometry and rejects invalid positions',()=>{
  const nav=createGroundNavigation(new Scene(),()=>({x:0,z:0}));nav.setRoute([[0,4,0],[20,4,0]]);let released=false;nav.group.children[0].geometry.addEventListener('dispose',()=>released=true);nav.setRoute([[0,4,0],[NaN,4,0]]);assert.ok(released);assert.equal(nav.group.visible,false);
});
