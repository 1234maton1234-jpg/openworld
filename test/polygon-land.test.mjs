import test from 'node:test';
import assert from 'node:assert/strict';
import {polygonInfo,containsPolygon,polygonDistance} from '../shared/polygon-land.mjs';
test('only convex land is accepted and self intersections and narrow notches are rejected',()=>{
  assert.throws(()=>polygonInfo([[0,0],[48,0],[48,24],[24,24],[24,48],[0,48]]),/凸多边形/);
  const square=[[0,0],[40,0],[40,40],[0,40]];
  assert.equal(polygonInfo(square).area,1600);assert.equal(polygonInfo([...square].reverse()).area,1600);
  assert.throws(()=>polygonInfo([[0,0],[40,40],[0,40],[40,0]]));
  assert.throws(()=>polygonInfo([[0,0],[40,0],[40,40],[24,40],[24,16],[20,16],[20,40],[0,40]]));
  assert.throws(()=>polygonInfo([[0,0],[40,0],[40,40],[0,NaN]]));
  assert.throws(()=>polygonInfo([[1,0],[40,0],[40,40],[0,40]]));
});
test('concave parcel containment checks edges, not only vertices or bounding boxes',()=>{
  const land=[[0,0],[48,0],[48,24],[24,24],[24,48],[0,48]];
  assert.equal(containsPolygon(land,[[4,4],[20,4],[20,20]]),true);
  assert.equal(containsPolygon(land,[[4,40],[40,4],[40,20]]),false);
  assert.equal(polygonDistance([[0,0],[20,0],[20,20],[0,20]],[[24,0],[44,0],[44,20],[24,20]]),4);
});
test('account limits can remove area and span caps without weakening shape rules',()=>{
  const large=[[0,0],[200,0],[200,100],[0,100]],unlimited={maxArea:null,maxSpan:null};
  assert.throws(()=>polygonInfo(large),/4096/);
  assert.equal(polygonInfo(large,unlimited).area,20000);
  assert.throws(()=>polygonInfo([[0,0],[400,0],[400,40],[0,40]],unlimited),/4:1/);
  assert.throws(()=>polygonInfo([[0,0],[200,0],[200,100],[100,40],[0,100]],unlimited),/凸多边形/);
});
