import test from 'node:test';
import assert from 'node:assert/strict';
import {constructionCoordinate,retainDryLocal} from '../shared/construction-layout.mjs';
import {axis,validateRegion} from '../shared/city-plan.mjs';
import {generateNaturalRegion} from '../shared/natural-plan.mjs';
test('construction axes preserve arterial boundaries and usable block widths',()=>{
  const widths=new Set();for(let n=-20;n<20;n++)for(const direction of [0,1]){const a=constructionCoordinate(axis(n),direction),b=constructionCoordinate(axis(n+1),direction);assert.ok(b-a>=180&&b-a<=380);if(n%2===0)assert.equal(a,axis(n));widths.add(Math.round(b-a));}assert.ok(widths.size>10);
});
test('coastal construction streets are straight, connected and share identical border geometry',()=>{
  const water={version:3,distance:()=>200};for(const [x,z] of [[0,0],[-2,1],[8,-7]]){const p=generateNaturalRegion(x,z,[],water);assert.deepEqual(validateRegion({...p,lots:[]}),[]);for(const r of p.roads){const a=r.points[0];assert.ok(r.points.every(v=>Math.abs(v[0]-a[0])<1e-6)||r.points.every(v=>Math.abs(v[2]-a[2])<1e-6));}for(const neighbor of [generateNaturalRegion(x+1,z,[],water),generateNaturalRegion(x,z+1,[],water)])for(const r of p.roads){const same=neighbor.roads.find(v=>v.id===r.id);if(same)assert.deepEqual(r,same);}}
});
test('local streets cannot route across river reserve, arterial bridge routes remain eligible',()=>{
  const r={id:'v:1:0',points:[[0,4,0],[0,4,200]]},water={version:3,distance:(x,z)=>Math.abs(z-100)};assert.equal(retainDryLocal(r,water),false);assert.equal(retainDryLocal({...r,id:'v:0:0'},water),true);assert.equal(retainDryLocal(r,{version:3,distance:()=>200}),true);
});
