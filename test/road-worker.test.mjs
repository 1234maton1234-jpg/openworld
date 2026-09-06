import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCityView} from '../src/city-view.mjs';
import {packCityMeshes} from '../src/city-mesh-transfer.mjs';
test('road worker coalesces movement and discards stale geometry',()=>{
  const original=globalThis.Worker;let worker;
  globalThis.Worker=class{constructor(){worker=this;this.sent=[];}postMessage(data){this.sent.push(data);}terminate(){}};
  try{
    let invalidations=0;const view=createCityView(new THREE.Scene(),()=>invalidations++),plan=x=>({regions:[{x,z:0,version:7}],roads:[{id:'road',width:10,points:[[x*70-50,4,0],[x*70+50,4,0]]}],lots:[],parks:[],legacy:[]});
    view.rebuild(0,0,plan(0),[]);view.rebuild(10,0,plan(10),[]);
    assert.equal(worker.sent.length,1);assert.equal(view.objects.length,0);
    const background=createCityView(new THREE.Scene(),()=>{},{background:false});
    function finish(request){background.rebuild(request.x,request.z,request.plan,request.values,true);const packet=packCityMeshes(background.objects,background.materials);worker.onmessage({data:{id:request.id,meshes:structuredClone(packet.meshes,{transfer:packet.transfer}),lamps:background.lamps,patches:background.patches}});}
    const first=worker.sent[0];finish(first);
    assert.equal(worker.sent.length,2);assert.equal(view.objects.length,0);
    const latest=worker.sent[1];finish(latest);
    const marking=view.objects.find(o=>o.userData.roadMarking==='double-yellow');assert.ok(marking);
    const pos=marking.geometry.attributes.position;for(let i=0;i<pos.count;i++)assert.ok(Math.abs(pos.getX(i))<=51);
    assert.equal(invalidations,1);
  }finally{if(original===undefined)delete globalThis.Worker;else globalThis.Worker=original;}
});
