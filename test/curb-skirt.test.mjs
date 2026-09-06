import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {curbSkirt} from '../src/curb-skirt.mjs';

test('coincident top triangles retain an outward facing curb instead of cancelling it',()=>{
  const top=new THREE.BufferGeometry(),triangle=[0,.25,0,0,.25,4,10,.25,0];
  top.setAttribute('position',new THREE.Float32BufferAttribute([...triangle,...triangle],3));
  const skirt=curbSkirt(top),mesh=new THREE.Mesh(skirt,new THREE.MeshBasicMaterial());mesh.updateMatrixWorld();
  const ray=new THREE.Raycaster(new THREE.Vector3(5,.125,-1),new THREE.Vector3(0,0,1));
  assert.ok(ray.intersectObject(mesh).length>0);
  assert.equal(skirt.attributes.position.count,18);
  top.dispose();skirt.dispose();mesh.material.dispose();
});

test('shared internal edges do not produce curb walls',()=>{
  const top=new THREE.PlaneGeometry(10,4);top.rotateX(-Math.PI/2);top.translate(0,.25,0);
  const skirt=curbSkirt(top);assert.equal(skirt.attributes.position.count,24);top.dispose();skirt.dispose();
});
