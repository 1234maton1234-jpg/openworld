import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCityView} from '../src/city-view.mjs';
import {generateRegion,cityHeight,riverDistance} from '../shared/city-plan.mjs';
import {createUrbanTerrain} from '../shared/urban-terrain.mjs';
import {createHydrology} from '../shared/hydrology.mjs';
import {generateUrbanRegion} from '../shared/urban-plan.mjs';

test('eight metre sidewalk lamps are instanced without the old count cap',()=>{
  const view=createCityView(new THREE.Scene());
  const roads=Array.from({length:20},(_,i)=>({id:String(i),width:10,points:[[-300,4,i*30],[300,4,i*30]]}));
  view.rebuild(0,0,{regions:[],lots:[],parks:[],legacy:[],roads},[]);
  const lamps=view.objects.filter(o=>o.userData.streetLight);
  assert.equal(lamps.length,2);assert.ok(lamps.every(o=>o.isInstancedMesh&&o.count>192));
  assert.equal(lamps[0].geometry.parameters.height,8);
  const matrix=new THREE.Matrix4();lamps[0].getMatrixAt(0,matrix);assert.equal(matrix.elements[13],8);
});

test('road join caps follow the approach slope instead of cutting through it',()=>{
  const view=createCityView(new THREE.Scene()),points=[[-60,7,0],[0,10,0],[60,13,0]],roads=[{id:'slope',width:16,points,sections:[{kind:'land',points:points.slice(0,2)},{kind:'land',points:points.slice(1)}]}];
  view.rebuild(0,0,{regions:[],lots:[],parks:[],legacy:[],roads},[]);
  const caps=view.objects.filter(o=>o.userData.roadJoin);assert.ok(caps.length);
  for(const mesh of caps){mesh.updateMatrixWorld();const pos=mesh.geometry.attributes.position;for(let i=0;i<pos.count;i++){const p=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);if(Math.abs(p.x)<59)assert.ok(Math.abs(p.y-(10+p.x*.05)-mesh.userData.surfaceLift)<1e-5);}}
});

test('moving within the cached city rebases meshes without rebuilding them',()=>{
  const view=createCityView(new THREE.Scene()),planning={regions:[],lots:[],parks:[],legacy:[],roads:[{id:'a',width:10,points:[[-300,4,0],[300,4,0]]}]};
  view.rebuild(0,0,planning,[]);const mesh=view.objects[0],geometry=mesh.geometry;
  view.rebuild(1,0,structuredClone(planning),[]);
  assert.equal(view.objects[0],mesh);assert.equal(view.objects[0].geometry,geometry);assert.equal(mesh.parent.position.x,-70);
  assert.equal(view.surface(70,0),4);
  view.rebuild(5,0,planning,[]);assert.notEqual(view.objects[0],mesh);assert.equal(view.objects[0].parent.position.x,0);
});

test('four metre sidewalks have paving and remain walkable on raised roads',()=>{
  const view=createCityView(new THREE.Scene());
  view.rebuild(0,0,{regions:[],lots:[],parks:[],legacy:[],roads:[{id:'raised',width:10,points:[[-60,20,0],[60,20,0]]}]},[]);
  assert.equal(view.surface(0,8.9),20);assert.notEqual(view.surface(0,9.1),20);
  const paving=view.objects.find(o=>o.userData.sidewalk);assert.ok(paving);
  assert.ok(paving.material.map);assert.ok(paving.geometry.attributes.uv);
  paving.geometry.computeBoundingBox();assert.equal(paving.geometry.boundingBox.max.z,9);
  paving.updateMatrixWorld();const ray=new THREE.Raycaster(new THREE.Vector3(0,30,0),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObject(paving).length,0,'sidewalk must not extend beneath the carriageway');
});
test('concave polygon foundation rendering and picking preserve its notch',()=>{
  const view=createCityView(new THREE.Scene()),polygon=[[-32,-32],[32,-32],[32,0],[0,0],[0,32],[-32,32]],plot={x:0,z:0,cx:0,cz:0,width:64,depth:64,elevation:12,version:8,owner:'a',polygon};
  view.rebuild(0,0,{regions:[],lots:[],roads:[],parks:[],legacy:[],terrain:{frozen:[]},hydrology:{version:3,frozen:[]}},[plot]);
  assert.ok(view.pick(-16,16));assert.equal(view.pick(16,16),undefined);assert.equal(view.ground(-16,16),12);assert.equal(view.surface(-16,16),12);
  const mesh=view.objects.find(o=>o.isMesh&&o.material.color.getHexString()==='cbd1b7');assert.ok(mesh);const ray=new THREE.Raycaster(new THREE.Vector3(16,50,16),new THREE.Vector3(0,-1,0));mesh.updateMatrixWorld();assert.equal(ray.intersectObject(mesh).length,0);
});

test('junction infill has upward normals and a matching walkable surface',()=>{
  const view=createCityView(new THREE.Scene());
  view.rebuild(0,0,{regions:[],lots:[],parks:[],legacy:[],roads:[{id:'a',width:16,points:[[-100,4,0],[100,4,0]]},{id:'b',width:10,points:[[-80,4,-60],[80,4,60]]}]},[]);
  const patches=view.objects.filter(o=>o.userData.junctionSurface);assert.equal(patches.length,2);
  const sidewalks=view.objects.filter(o=>o.userData.sidewalk);for(const mesh of sidewalks)mesh.updateMatrixWorld();
  for(const [x,z] of [[0,0],[2,1],[-3,-2]]){const ray=new THREE.Raycaster(new THREE.Vector3(x,50,z),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObjects(sidewalks).length,0,'no sidewalk triangles inside the junction roadway');}
  for(const mesh of patches){const {position,normal}=mesh.geometry.attributes;for(let i=0;i<position.count;i++){assert.ok(normal.getY(i)>.99);assert.ok(Math.abs(view.surface(position.getX(i)*.95,position.getZ(i)*.95)-4)<1e-6);}}
});
test('road paint is batched, upward facing and above the walking surface',()=>{
  const view=createCityView(new THREE.Scene());
  view.rebuild(0,0,{regions:[],lots:[],parks:[],legacy:[],roads:[{id:'a',width:10,points:[[-60,4,0],[60,4,0]]},{id:'b',width:10,points:[[0,4,-60],[0,4,60]]}]},[]);
  const paint=view.objects.filter(o=>o.userData.roadMarking);assert.equal(paint.length,2);
  for(const mesh of paint){const {position,normal}=mesh.geometry.attributes;for(let i=0;i<position.count;i++){assert.ok(normal.getY(i)>.99);assert.ok(Math.abs(position.getY(i)-4.045)<.001);}}
  assert.equal(view.surface(0,0),4);
});
test('rendered bridges are upward facing and walkable above the river',()=>{
  const plan=generateRegion(0,1),scene=new THREE.Scene(),view=createCityView(scene),data={regions:[plan],lots:plan.lots,roads:plan.roads,parks:plan.parks,legacy:[]};view.rebuild(0,8,data,[]);
  const bridge=plan.roads.find(r=>r.bridge&&r.points.some(p=>riverDistance(p[0],p[2])<10));assert.ok(bridge);
  const point=bridge.points.find(p=>riverDistance(p[0],p[2])<10);assert.ok(cityHeight(point[0],point[2])<0);assert.ok(Math.abs(view.surface(point[0],point[2])-point[1])<.001);
  const roadMesh=view.objects.find(o=>o.material?.color?.getHexString()==='939b91');assert.ok(roadMesh.geometry.attributes.normal.getY(0)>.99);
  const lot=plan.lots[0];assert.equal(view.pick(lot.cx,lot.cz).x,lot.x);assert.equal(view.surface(lot.cx,lot.cz),lot.elevation);assert.equal(view.pick(lot.cx+33,lot.cz),undefined);
  const count=view.objects.length;view.rebuild(0,8,data,[]);assert.equal(view.objects.length,count);
});

test('urban rendering, ground and walking use the persisted flat foundations',()=>{
  const water=createHydrology(),field=createUrbanTerrain([],water),plan=generateUrbanRegion(20,20,[],water,field),view=createCityView(new THREE.Scene());
  view.rebuild(160,160,{terrain:{version:2,frozen:[]},hydrology:{version:2,frozen:[]},regions:[plan],lots:plan.lots,roads:plan.roads,parks:plan.parks,legacy:[]},[]);
  for(const lot of plan.lots){assert.equal(view.ground(lot.cx,lot.cz),lot.elevation);assert.equal(view.surface(lot.cx,lot.cz),lot.elevation);assert.equal(view.pick(lot.cx,lot.cz).x,lot.x);}
});
