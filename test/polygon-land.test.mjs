import test from 'node:test';
import assert from 'node:assert/strict';
import {polygonInfo,containsPolygon,polygonDistance} from '../shared/polygon-land.mjs';
test('simple concave land is accepted but self intersections and narrow notches are rejected',()=>{
  assert.equal(polygonInfo([[0,0],[48,0],[48,24],[24,24],[24,48],[0,48]]).area,1728);
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
