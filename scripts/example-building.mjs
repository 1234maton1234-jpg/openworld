import {Document,NodeIO} from '@gltf-transform/core';
import * as THREE from 'three';
import {writeFileSync} from 'node:fs';
import {validateModel} from '../server/validate.mjs';
const d=new Document(),buffer=d.createBuffer(),scene=d.createScene('Sakura cafe');d.getRoot().setDefaultScene(scene);
const materials=new Map();function material(color){if(!materials.has(color)){const c=new THREE.Color(color);materials.set(color,d.createMaterial().setBaseColorFactor([c.r,c.g,c.b,1]).setRoughnessFactor(.9).setMetallicFactor(0));}return materials.get(color);}
function mesh(geometry,color,position,name='detail'){
  const p=d.createPrimitive().setMaterial(material(color));
  for(const [key,semantic] of [['position','POSITION'],['normal','NORMAL'],['uv','TEXCOORD_0']]){const a=geometry.getAttribute(key);if(a)p.setAttribute(semantic,d.createAccessor().setType(a.itemSize===3?'VEC3':'VEC2').setArray(new Float32Array(a.array)).setBuffer(buffer));}
  if(geometry.index)p.setIndices(d.createAccessor().setType('SCALAR').setArray(new Uint16Array(geometry.index.array)).setBuffer(buffer));
  scene.addChild(d.createNode(name).setTranslation(position).setMesh(d.createMesh(name).addPrimitive(p)));geometry.dispose();
}
function box(size,position,color,name){mesh(new THREE.BoxGeometry(...size),color,position,name);}
box([26,.3,25],[0,.15,0],'#ccd0b1','garden foundation');box([15,6,11],[0,3.3,-1],'#ead8b5','cafe walls');box([16,.35,12],[0,6.4,-1],'#5e7771');
const roof=new THREE.CylinderGeometry(0,1,1,4,1,false);roof.rotateY(Math.PI/4);roof.scale(12,3.5,9);mesh(roof,'#45665f',[0,8.3,-1],'hip roof');
for(const x of [-7.55,7.55])box([.2,6.2,11.3],[x,3.35,-1],'#745648');
for(const y of [1.9,4.9])for(const x of [-5,0,5]){box([3,1.85,.18],[x,y,4.57],'#4b7b80','window');box([3.4,.14,.32],[x,y-1,4.6],'#735849');box([.1,1.9,.25],[x,y,4.7],'#dfd7bb');}
box([2.2,2.8,.22],[0,1.7,4.65],'#634b3c','entry');box([1.8,1.65,.1],[0,2.1,4.8],'#669391');
box([16,.28,3],[0,3.55,6],'#ba807e','awning');for(let i=0;i<8;i++)box([1,.15,3.05],[-7.5+i*2,3.7,6],'#f2e2c1');
for(const x of [-7,7])box([.22,3.5,.22],[x,1.9,7.2],'#776351');
for(const x of [-9.8,9.8])for(const z of [-7,7]){box([2,.8,2],[x,.7,z],'#bdb58e','planter');box([.35,3,.35],[x,2.5,z],'#826c53');mesh(new THREE.IcosahedronGeometry(1.6,1),'#b5c99a',[x,4,z],'tree crown');mesh(new THREE.IcosahedronGeometry(1.25,1),'#e9b8c2',[x+.5,4.5,z],'sakura');}
for(const x of [-5,5]){mesh(new THREE.CylinderGeometry(1.1,1.1,.16,16),'#ddd0aa',[x,1.1,9],'table');box([.18,.8,.18],[x,.65,9],'#6f7560');for(const offset of [-1.7,1.7]){box([1,.15,1],[x+offset,.8,9],'#829879');box([.15,.7,.15],[x+offset,.45,9],'#6f7560');}}
for(let i=0;i<19;i++){const x=-11.4+i*1.27;box([.18,1.1,.18],[x,.85,-11.5],'#f1e9cb');}box([24,.12,.12],[0,1.1,-11.5],'#f1e9cb');
const bytes=Buffer.from(await new NodeIO().writeBinary(d)),metrics=await validateModel(bytes);writeFileSync('public/example-building.glb',bytes);console.log(metrics);
