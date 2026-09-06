import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCityView} from '../src/city-view.mjs';
import {packCityMeshes,unpackCityMeshes} from '../src/city-mesh-transfer.mjs';
test('outdated background results cannot replace a newer moving city request',t=>{
  const original=globalThis.Worker;let worker;globalThis.Worker=class{constructor(){worker=this;this.sent=[];}postMessage(data){this.sent.push(data);}terminate(){}};t.after(()=>{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;});
  const plan={roads:[{id:'a',width:18,points:[[-100,4,0],[900,4,0]]}],lots:[],regions:[],parks:[],legacy:[]},view=createCityView(new THREE.Scene()),background=createCityView(new THREE.Scene(),()=>{},{background:false});
  function finish(request){background.rebuild(request.x,request.z,request.plan,request.values,true);const packet=packCityMeshes(background.objects,background.materials);worker.onmessage({data:{id:request.id,meshes:structuredClone(packet.meshes,{transfer:packet.transfer}),lamps:background.lamps,patches:background.patches}});}
  view.rebuild(0,0,plan,[]);assert.equal(view.objects.length,0);finish(worker.sent[0]);const lamp=view.lamps[0].p;assert.equal(view.blocked(lamp[0],lamp[2],lamp[1]+.25),true);const old=view.objects[0];view.rebuild(4,0,plan,[]);const stale=worker.sent.at(-1);view.rebuild(5,0,plan,[]);assert.equal(view.objects[0],old);assert.equal(old.parent.position.x,-350);finish(stale);assert.equal(view.objects[0],old);const latest=worker.sent.at(-1);assert.equal(latest.x,5);finish(latest);assert.notEqual(view.objects[0],old);assert.equal(view.objects[0].parent.position.x,0);
});
test('background city geometry survives ownership transfer including lamps and borders',()=>{
  const view=createCityView(new THREE.Scene(),()=>{},{background:false}),plan={roads:[{id:'a',width:18,points:[[-100,4,0],[100,4,0]]}],lots:[],regions:[],parks:[],legacy:[]};view.rebuild(0,0,plan,[],true);
  const expected=view.objects.map(o=>({positions:[...o.geometry.attributes.position.array],type:o.type,matrix:o.matrix.toArray()})),packet=packCityMeshes(view.objects,view.materials),received=structuredClone(packet.meshes,{transfer:packet.transfer}),objects=unpackCityMeshes(received,view.materials);
  assert.ok(objects.some(o=>o.isInstancedMesh));assert.equal(objects.length,expected.length);objects.forEach((o,i)=>{assert.deepEqual([...o.geometry.attributes.position.array],expected[i].positions);assert.equal(o.type,expected[i].type);assert.deepEqual(o.matrix.toArray(),expected[i].matrix);});
  view.rebuild(1,0,plan,[],true);assert.ok(view.objects.every(o=>o.geometry.attributes.position.array.length>0));
});
