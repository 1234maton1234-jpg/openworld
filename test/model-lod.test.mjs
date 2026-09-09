import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,Group,Mesh,BoxGeometry,PlaneGeometry,MeshStandardMaterial,PerspectiveCamera,Plane,Vector3} from 'three';
import {createModelLodManager,selectModelLod,releaseModelLods} from '../src/model-lod.mjs';
import {createBuildingCollision} from '../src/building-collision.mjs';
import {prepareCarModel,releaseCar} from '../src/custom-car.mjs';
import {createVehicleAvatarClip} from '../src/vehicle-avatar-clip.mjs';
import {Texture} from 'three';

function fixture(geometry=new BoxGeometry()){
  const scene=new Group(),material=new MeshStandardMaterial(),mesh=new Mesh(geometry,material);mesh.name='interactive-seat';mesh.userData.interaction={type:'sit'};scene.add(mesh);
  return {scene,mesh,parser:{associations:new Map([[mesh,{meshes:0,primitives:0}]])}};
}
const flush=()=>new Promise(r=>setImmediate(r));
test('leaving a vehicle restores materials with the current LOD textures',async()=>{
  const original=fixture(),low=fixture(new PlaneGeometry()),scene=new Scene(),camera=new PerspectiveCamera();original.mesh.material.map=new Texture();low.mesh.material.map=new Texture();scene.add(original.scene);original.scene.position.z=-60;
  const manager=createModelLodManager({fetcher:async()=>({ok:true,json:async()=>({variants:[{level:1,url:'one'}]})}),load:async()=>low});manager.register(original,'/api/avatar/test.glb');const material=original.mesh.material,clip=createVehicleAvatarClip(original.scene),car=new Group();car.add(new Mesh(new BoxGeometry(),new MeshStandardMaterial()));clip.update({type:'car',group:car});
  manager.update(camera,1000);await flush();manager.update(camera,1400);const texture=original.mesh.material.map;assert.equal(texture,low.mesh.material.map);clip.clear();assert.equal(original.mesh.material,material);assert.equal(material.map,texture);manager.dispose();
});
test('vehicle LOD preserves reparented wheel pivots and four-seat declarations',async()=>{
  const original=fixture(),wheel=new Mesh(new BoxGeometry(.4,.4,.2),new MeshStandardMaterial());wheel.name='wheel_fl';wheel.position.set(-.6,.4,-1);original.scene.add(wheel);original.parser.associations.set(wheel,{meshes:1,primitives:0});
  original.scene.userData.vehicle={seats:[[-.35,.65,-.3],[.35,.65,-.3],[-.35,.65,.6],[.35,.65,.6]]};
  const derivative=fixture(new PlaneGeometry()),lowWheel=new Mesh(new PlaneGeometry(),new MeshStandardMaterial());derivative.scene.add(lowWheel);derivative.parser.associations.set(lowWheel,{meshes:1,primitives:0});
  const manager=createModelLodManager({fetcher:async()=>({ok:true,json:async()=>({variants:[{level:1,url:'one'}]})}),load:async()=>derivative});manager.register(original,'/api/vehicle/car.glb');const car=prepareCarModel(original.scene),scene=new Scene(),camera=new PerspectiveCamera();scene.add(car.group);car.group.position.z=-65;const parent=wheel.parent,geometry=wheel.geometry;
  manager.update(camera,1000);await flush();manager.update(camera,1400);assert.notEqual(wheel.geometry,geometry);assert.equal(wheel.parent,parent);assert.equal(car.seats.length,4);car.wheels[0].spin.rotation.x=1.2;car.wheels[0].pivot.rotation.y=.3;scene.updateMatrixWorld(true);assert.ok(wheel.matrixWorld.elements.every(Number.isFinite));
  car.group.position.z=-5;manager.update(camera,1800);assert.equal(wheel.geometry,geometry);assert.equal(car.wheels[0].spin.rotation.x,1.2);releaseCar(car.group);manager.dispose();
});
test('offscreen assets do not request derivatives and large nearby surfaces retain detail',async()=>{
  const scene=new Scene(),camera=new PerspectiveCamera(),behind=fixture(),large=fixture(new BoxGeometry(10,10,200));behind.scene.position.z=80;large.scene.position.z=-100;scene.add(behind.scene,large.scene);
  let requests=0;const manager=createModelLodManager({fetcher:async()=>{requests++;return {status:202};}});manager.register(behind,'/assets/behind.glb');manager.register(large,'/assets/large.glb');manager.update(camera,1000);await flush();assert.equal(requests,0);assert.equal(large.mesh.userData.modelLod,undefined);manager.dispose();
});
test('current player priority wins over other models under a crowded budget',()=>{
  const scene=new Scene(),camera=new PerspectiveCamera(),other=fixture(),player=fixture();other.scene.position.z=-2;player.scene.position.z=-5;player.scene.userData.modelPriority=2;scene.add(other.scene,player.scene);
  const manager=createModelLodManager({triangleBudget:12,fetcher:async()=>({status:202})});manager.register(other,'/assets/other.glb');manager.register(player,'/api/avatar/player.glb');manager.update(camera,1000);assert.ok(player.mesh.visible);assert.equal(other.mesh.visible,false);manager.dispose();
});
test('derivatives completing after removal release geometry and materials',async()=>{
  const original=fixture(),scene=new Scene(),camera=new PerspectiveCamera(),derivative=fixture();scene.add(original.scene);original.scene.position.z=-60;
  let complete,geometryDisposed=false,materialDisposed=false;derivative.mesh.geometry.addEventListener('dispose',()=>geometryDisposed=true);derivative.mesh.material.addEventListener('dispose',()=>materialDisposed=true);
  const manager=createModelLodManager({fetcher:async()=>({ok:true,json:async()=>({variants:[{level:1,url:'lod1'}]})}),load:()=>new Promise(resolve=>complete=resolve)});
  manager.register(original,'/assets/test.glb');manager.update(camera,1000);await flush();releaseModelLods(original.scene);complete(derivative);await flush();assert.ok(geometryDisposed);assert.ok(materialDisposed);assert.equal(manager.stats.models,1);manager.dispose();
});
test('LOD hysteresis prevents repeated switches close to distance thresholds',()=>{
  assert.equal(selectModelLod(49,0),0);assert.equal(selectModelLod(51,0),1);assert.equal(selectModelLod(49,1),1);assert.equal(selectModelLod(34,1),0);
  assert.equal(selectModelLod(126,1),2);assert.equal(selectModelLod(110,2),2);assert.equal(selectModelLod(99,2),1);
});
test('visual LOD preserves object identity, clipping materials, transforms and original building collision',async()=>{
  const original=fixture(),scene=new Scene(),camera=new PerspectiveCamera();original.scene.position.z=-60;scene.add(original.scene);
  const collision=createBuildingCollision(original.scene),geometry=original.mesh.geometry,material=original.mesh.material,clip=[new Plane(new Vector3(1,0,0),1)];material.clippingPlanes=clip;
  let disposed=false;geometry.addEventListener('dispose',()=>disposed=true);
  const manager=createModelLodManager({fetcher:async()=>({ok:true,json:async()=>({variants:[{level:1,url:'lod1'}]})}),load:async()=>fixture(new PlaneGeometry())});
  manager.register(original,'/assets/test.glb');manager.update(camera,1000);await flush();manager.update(camera,1400);
  assert.notEqual(original.mesh.geometry,geometry);assert.equal(original.mesh.material,material);assert.equal(material.clippingPlanes,clip);assert.equal(original.mesh.name,'interactive-seat');assert.deepEqual(original.mesh.userData.interaction,{type:'sit'});assert.equal(collision.surface(0,-60),.5);assert.ok(disposed);
  original.scene.position.z=-10;manager.update(camera,1800);assert.equal(original.mesh.geometry,geometry);releaseModelLods(original.scene);assert.equal(original.scene.userData.disposeModelLod,null);manager.dispose();
});
test('scene budget prioritizes nearby geometry and restores culled meshes when budget frees',()=>{
  const scene=new Scene(),camera=new PerspectiveCamera(),near=fixture(),far=fixture();near.scene.position.z=-5;far.scene.position.z=-80;scene.add(near.scene,far.scene);
  const manager=createModelLodManager({triangleBudget:12,load:async()=>{throw Error();},fetcher:async()=>({status:202})});manager.register(near,'/assets/near.glb');manager.register(far,'/assets/far.glb');manager.update(camera,1000);
  assert.equal(near.mesh.visible,true);assert.equal(far.mesh.visible,false);assert.equal(manager.stats.triangles,12);releaseModelLods(near.scene);manager.update(camera,1400);assert.equal(far.mesh.visible,true);manager.dispose();
});
