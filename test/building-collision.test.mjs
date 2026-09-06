import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createBuildingCollision} from '../src/building-collision.mjs';
test('courtyard and stairs are walkable while walls and tall obstacles block',()=>{
  const root=new T.Group();
  function box(x,y,z,w,h,d){const m=new T.Mesh(new T.BoxGeometry(w,h,d));m.position.set(x,y,z);root.add(m);}
  box(0,.17,0,30,.34,20);box(2,.5,0,3,.3,6);box(4,.65,0,2,.6,6);box(8,6,0,6,12,8);
  const c=createBuildingCollision(root);
  assert.ok(Math.abs(c.surface(-10,0,.8)-.34)<1e-6);assert.equal(c.blocked(-10,0,0),false);
  assert.ok(Math.abs(c.surface(2,0,1.14)-.65)<1e-6);assert.equal(c.blocked(2,0,.34),false);
  assert.ok(Math.abs(c.surface(4,0,1.45)-.95)<1e-6);assert.equal(c.blocked(4,0,.65),false);
  assert.equal(c.blocked(4.8,0,.95),true);assert.ok(c.surface(8,0,1.75)<1,'roof must not pull walkers upward');
  assert.equal(c.blocked(-10,0,3),false);
  root.position.set(-70,4,140);
  assert.ok(Math.abs(c.surface(-80,140,4.8)-4.34)<1e-6);assert.equal(c.blocked(-65.2,140,4.95),true);
});
