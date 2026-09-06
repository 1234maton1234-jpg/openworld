import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTerrain} from '../src/terrain-view.mjs';
test('terrain streams chunks without removing existing ground on a region update',()=>{
  const scene=new THREE.Scene(),terrain=createTerrain(scene),sun=new THREE.DirectionalLight(),plan={regions:[],roads:[],lots:[],parks:[],legacy:[]};
  terrain.rebuild(0,0,[],plan);const ground=scene.children[0];assert.equal(ground.children.length,0);
  terrain.update(.016,sun,true);assert.ok(ground.children.length>0);assert.ok(ground.children.length<441);
  const old=ground.children[0],geometry=old.geometry,x=old.position.x;
  terrain.rebuild(1,0,[],{...plan,regions:[{x:1,z:0,version:7}]});
  assert.ok(ground.children.includes(old));assert.equal(old.geometry,geometry);assert.equal(old.position.x,x-70);
});
