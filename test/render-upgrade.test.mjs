import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Mesh,BoxGeometry,MeshStandardMaterial} from 'three';
import {createWetRoads} from '../src/render-quality.mjs';
import {createDefaultCar} from '../src/default-car.mjs';

test('wet road treatment is selective, reversible and tracks streamed geometry',()=>{
  const scene=new Scene(),asphalt=new MeshStandardMaterial({name:'asphalt',roughness:.96,bumpScale:.008}),wall=new MeshStandardMaterial();
  const road=new Mesh(new BoxGeometry(),asphalt),building=new Mesh(new BoxGeometry(),wall);scene.add(road,building);
  const wet=createWetRoads();assert.deepEqual(wet.update(scene,true),[road]);
  assert.ok(asphalt.roughness<.5);assert.ok(asphalt.roughnessMap?.isDataTexture);assert.equal(wall.roughness,1);
  wet.update(scene,false);assert.equal(asphalt.roughness,.96);assert.equal(asphalt.roughnessMap,null);assert.equal(asphalt.bumpScale,.008);
  wet.update(scene,true);scene.remove(road);assert.deepEqual(wet.update(scene,true),[]);wet.dispose();
});
test('default car uses clearcoat while keeping transparent cabin windows',()=>{
  const {group}=createDefaultCar(),materials=new Set();group.traverse(o=>{if(o.material)materials.add(o.material);});
  assert.ok([...materials].some(m=>m.isMeshPhysicalMaterial&&m.clearcoat>.5));
  const windows=[...materials].filter(m=>m.transparent);assert.ok(windows.length);
  assert.ok(windows.every(m=>m.isMeshPhysicalMaterial&&m.opacity<.7&&!m.depthWrite));
});
