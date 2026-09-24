import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCityView} from '../src/city-view.mjs';
import {generateRegion,cityHeight,riverDistance} from '../shared/city-plan.mjs';
import {createUrbanTerrain} from '../shared/urban-terrain.mjs';
import {createHydrology} from '../shared/hydrology.mjs';
import {generateUrbanRegion} from '../shared/urban-plan.mjs';

test('claimed plots do not add entrance pavement or an invisible walking surface',()=>{
  const view=createCityView(new THREE.Scene(),()=>{},{background:false});
  const plot={x:0,z:1,cx:0,cz:40,width:20,depth:20,elevation:4.25,owner:'test',entrance:{points:[[0,4.25,30],[0,4,0]]}};
  view.rebuild(0,0,{regions:[],lots:[],parks:[],legacy:[],roads:[{id:'road',width:10,points:[[-100,4,0],[100,4,0]]}]},[plot]);
  const walks=view.objects.filter(o=>o.userData.sidewalk);walks.forEach(o=>o.updateMatrixWorld());
  assert.equal(new THREE.Raycaster(new THREE.Vector3(0,20,20),new THREE.Vector3(0,-1,0)).intersectObjects(walks).length,0);
  assert.equal(view.surface(0,20),view.ground(0,20));
});

test('sloping bridge cannot erase a lower sidewalk where their elevations differ',()=>{
  const view=createCityView(new THREE.Scene());
  view.rebuild(0,0,{regions:[],lots:[],parks:[],legacy:[],roads:[
    {id:'low',width:10,points:[[-100,4,80],[100,4,80]]},
    {id:'ramp',width:10,points:[[0,4,-100],[0,14,100]]}
  ]},[]);
  const walks=view.objects.filter(o=>o.userData.sidewalk);walks.forEach(o=>o.updateMatrixWorld());
  const ray=new THREE.Raycaster(new THREE.Vector3(0,6,88),new THREE.Vector3(0,-1,0));assert.ok(ray.intersectObjects(walks).length>0,'the lower sidewalk must remain below the sloped deck');
});

test('sidewalks cannot cross asphalt where nearby roads merge without a shared node',()=>{
  const view=createCityView(new THREE.Scene());
  view.rebuild(0,0,{regions:[],lots:[],parks:[],legacy:[],roads:[
    {id:'wide',width:28,points:[[-100,4,0],[100,4,0]]},
    {id:'merge',width:10,points:[[-100,4,10],[0,4,10],[70,4,35]]}
  ]},[]);
  const walks=view.objects.filter(o=>o.userData.sidewalk);walks.forEach(o=>o.updateMatrixWorld());
  for(const x of [-70,-30,10]){const ray=new THREE.Raycaster(new THREE.Vector3(x,40,8),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObjects(walks).length,0,'parallel road sidewalk intrudes into the wider carriageway');assert.equal(view.surface(x,8),4);}
});

test('eight metre sidewalk lamps are instanced without the old count cap',()=>{
  const view=createCityView(new THREE.Scene());
  const roads=Array.from({length:20},(_,i)=>({id:String(i),width:10,points:[[-300,4,i*30],[300,4,i*30]]}));
  view.rebuild(0,0,{regions:[],lots:[],parks:[],legacy:[],roads},[]);
  const lamps=view.objects.filter(o=>o.userData.streetLight);
  assert.equal(lamps.length,2);assert.ok(lamps.every(o=>o.isInstancedMesh&&o.count>192));
  lamps[0].geometry.computeBoundingBox();const bounds=lamps[0].geometry.boundingBox;assert.ok(bounds.max.y>8&&bounds.max.y<8.5);assert.ok(Math.abs(bounds.min.y)<1e-6);
  const matrix=new THREE.Matrix4();lamps[0].getMatrixAt(0,matrix);assert.equal(matrix.elements[13],4.25);
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
  assert.equal(view.surface(0,8.9),20.25);assert.equal(view.surface(0,0),20);assert.notEqual(view.surface(0,9.1),20.25);
  const paving=view.objects.find(o=>o.userData.sidewalk);assert.ok(paving);
  assert.ok(paving.material.map);assert.ok(paving.geometry.attributes.uv);
  paving.geometry.computeBoundingBox();assert.equal(paving.geometry.boundingBox.max.z,9);assert.equal(paving.geometry.boundingBox.max.y,20.25);
  const curb=view.objects.find(o=>o.userData.curb);curb.geometry.computeBoundingBox();assert.equal(curb.geometry.boundingBox.min.y,20);assert.equal(curb.geometry.boundingBox.max.y,20.25);
  paving.updateMatrixWorld();const ray=new THREE.Raycaster(new THREE.Vector3(0,30,0),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObject(paving).length,0,'sidewalk must not extend beneath the carriageway');
});
test('concave polygon foundation rendering and picking preserve its notch',()=>{
  const view=createCityView(new THREE.Scene()),polygon=[[-32,-32],[32,-32],[32,0],[0,0],[0,32],[-32,32]],plot={x:0,z:0,cx:0,cz:0,width:64,depth:64,elevation:12,version:8,owner:'a',polygon};
  view.rebuild(0,0,{regions:[],lots:[],roads:[],parks:[],legacy:[],terrain:{frozen:[]},hydrology:{version:3,frozen:[]}},[plot]);
  assert.ok(view.pick(-16,16));assert.equal(view.pick(16,16),undefined);assert.equal(view.ground(-16,16),12);assert.equal(view.surface(-16,16),12);
  const mesh=view.objects.find(o=>o.isMesh&&o.material.name==='grass');assert.ok(mesh);const ray=new THREE.Raycaster(new THREE.Vector3(16,50,16),new THREE.Vector3(0,-1,0));mesh.updateMatrixWorld();assert.equal(ray.intersectObject(mesh).length,0);
});

test('ribbon mitres reach the true carriageway edge at sharp corners',()=>{
  const view=createCityView(new THREE.Scene()),points=[[-120,4,0],[0,4,0],[0,4,120]];
  view.rebuild(0,0,{regions:[],lots:[],parks:[],legacy:[],roads:[{id:'corner',width:18,points}]},[]);
  const asphalt=view.objects.filter(o=>o.material?.name==='asphalt');assert.ok(asphalt.length);
  for(const mesh of asphalt)mesh.updateMatrixWorld();
  const ray=new THREE.Raycaster();
  for(const [x,z] of [[-100,8.9],[-100,-8.9],[8.9,100],[-8.9,100],[-8.5,8.5],[-8,8],[8,-8],[-8.9,-8.9],[8.9,8.9],[-8.5,0.5]]){
    ray.set(new THREE.Vector3(x,30,z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObjects(asphalt,false)[0];
    assert.ok(hit,`carriageway at ${x},${z} has no asphalt`);assert.ok(Math.abs(hit.point.y-4.012)<.05);
  }
});
test('a road join cap is as wide as the widest road meeting there',()=>{
  const view=createCityView(new THREE.Scene()),approach=[[-100,4,0],[0,4,0]],deck=[[0,4,0],[100,4,0]];
  view.rebuild(0,0,{regions:[],lots:[],parks:[],legacy:[],roads:[{id:'road',width:18,points:[[-100,4,0],[0,4,0],[100,4,0]],sections:[
    {kind:'land',width:18,points:approach},
    {kind:'crossing',width:28,points:deck,deckStart:0,deckEnd:1}
  ]}]},[]);
  const walks=view.objects.filter(o=>o.userData.sidewalk);for(const mesh of walks)mesh.updateMatrixWorld();
  assert.ok(walks.length);
  const ray=new THREE.Raycaster(new THREE.Vector3(-2,30,16),new THREE.Vector3(0,-1,0));
  const hit=ray.intersectObjects(walks,false)[0];
  assert.ok(hit,`the bridgehead sidewalk band is unpaved 16 m from the join, so the cap is narrower than the ${28} m bridge`);
  assert.ok(Math.abs(hit.point.y-4.25)<.05);
});
test('junction infill has upward normals and a matching walkable surface',()=>{
  const view=createCityView(new THREE.Scene());
  view.rebuild(0,0,{regions:[],lots:[],parks:[],legacy:[],roads:[{id:'a',width:16,points:[[-100,4,0],[100,4,0]]},{id:'b',width:10,points:[[-80,4,-60],[80,4,60]]}]},[]);
  const patches=view.objects.filter(o=>o.userData.junctionSurface);assert.equal(patches.length,2);
  const sidewalks=view.objects.filter(o=>o.userData.sidewalk);for(const mesh of sidewalks)mesh.updateMatrixWorld();
  for(const [x,z] of [[0,0],[2,1],[-3,-2]]){const ray=new THREE.Raycaster(new THREE.Vector3(x,50,z),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObjects(sidewalks).length,0,'no sidewalk triangles inside the junction roadway');}
  for(const mesh of patches){const {position,normal}=mesh.geometry.attributes;for(let i=0;i<position.count;i++){assert.ok(normal.getY(i)>.99);const y=view.surface(position.getX(i)*.95,position.getZ(i)*.95);assert.ok(Math.abs(y-4)<1e-6||Math.abs(y-4.25)<1e-6);}}
  assert.equal(view.surface(0,0),4);assert.equal(view.surface(70,-10),4.25);
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
  const roadMesh=view.objects.find(o=>o.material?.name==='asphalt');assert.ok(roadMesh);assert.ok(roadMesh.geometry.attributes.normal.getY(0)>.99);
  const lot=plan.lots[0];assert.equal(view.pick(lot.cx,lot.cz).x,lot.x);assert.equal(view.surface(lot.cx,lot.cz),lot.elevation);assert.equal(view.pick(lot.cx+33,lot.cz),undefined);
  const count=view.objects.length;view.rebuild(0,8,data,[]);assert.equal(view.objects.length,count);
});

test('urban rendering, ground and walking use the persisted flat foundations',()=>{
  const water=createHydrology(),field=createUrbanTerrain([],water),plan=generateUrbanRegion(20,20,[],water,field),view=createCityView(new THREE.Scene());
  view.rebuild(160,160,{terrain:{version:2,frozen:[]},hydrology:{version:2,frozen:[]},regions:[plan],lots:plan.lots,roads:plan.roads,parks:plan.parks,legacy:[]},[]);
  for(const lot of plan.lots){assert.equal(view.ground(lot.cx,lot.cz),lot.elevation);assert.equal(view.surface(lot.cx,lot.cz),lot.elevation);assert.equal(view.pick(lot.cx,lot.cz).x,lot.x);}
});
