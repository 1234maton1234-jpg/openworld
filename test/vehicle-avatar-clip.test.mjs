import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Mesh,BoxGeometry,MeshStandardMaterial,Vector3} from 'three';
import {createVehicleAvatarClip} from '../src/vehicle-avatar-clip.mjs';

test('vehicle clipping follows rotation and rebasing and restores shared materials on exit',()=>{
  const root=new Group(),original=new MeshStandardMaterial(),body=new Mesh(new BoxGeometry(1,2,1),original);root.add(body);
  const car=new Group();car.add(new Mesh(new BoxGeometry(2,2,4),new MeshStandardMaterial()));car.position.set(100,5,-200);car.rotation.y=Math.PI/3;
  const clip=createVehicleAvatarClip(root);clip.update({type:'car',group:car});
  assert.notEqual(body.material,original);assert.equal(original.clippingPlanes,null);assert.equal(body.material.clipShadows,true);
  const contains=p=>body.material.clippingPlanes.every(plane=>plane.distanceToPoint(p)>=-1e-6);
  assert.ok(contains(car.localToWorld(new Vector3())));assert.equal(contains(car.localToWorld(new Vector3(2,0,0))),false);assert.equal(contains(car.localToWorld(new Vector3(0,2,0))),false);
  car.position.x-=70;clip.update({type:'car',group:car});assert.ok(contains(car.localToWorld(new Vector3())));
  let disposed=false;body.material.addEventListener('dispose',()=>disposed=true);clip.update(null);assert.equal(body.material,original);assert.ok(disposed);
  clip.update({type:'bike',group:car});assert.equal(body.material,original);
});
