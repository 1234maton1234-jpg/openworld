import test from 'node:test';
import assert from 'node:assert/strict';
import {subtractConvex} from '../src/road-clipping.mjs';
const area=p=>Math.abs(p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[2]-b[0]*a[2];},0))/2;
test('sidewalk triangles are removed inside the road polygon while retaining height',()=>{
  const square=[[0,0,0],[10,1,0],[10,1,10],[0,0,10]],road=[[4,0,-1],[11,0,-1],[11,0,11],[4,0,11]],pieces=subtractConvex(square,road);
  assert.ok(Math.abs(pieces.reduce((sum,p)=>sum+area(p),0)-40)<1e-8);
  for(const piece of pieces)for(const p of piece){assert.ok(p[0]<=4+1e-8);assert.ok(Math.abs(p[1]-p[0]/10)<1e-8);}
  assert.deepEqual(subtractConvex(square,[[-1,0,-1],[11,0,-1],[11,0,11],[-1,0,11]]),[]);
});
