import test from 'node:test';
import assert from 'node:assert/strict';
import {archRoad} from '../shared/bridge-arch.mjs';
import {createCityView} from '../src/city-view.mjs';
import * as THREE from 'three';
test('wide river bridges have a visible crown proportional to their span',()=>{
  for(const length of [200,1000,2600]){
    const points=Array.from({length:101},(_,i)=>[i*length/100,10,0]);
    const result=archRoad({sections:[{kind:'crossing',points}]}).sections[0].points;
    assert.ok(result[50][1]-10>=Math.min(24,length*.014));
    assert.deepEqual(result[0],points[0]);assert.deepEqual(result.at(-1),points.at(-1));
    for(let i=1;i<result.length;i++)assert.ok(Math.abs(result[i][1]-result[i-1][1])/(length/100)<=.05);
  }
});
test('gentle bridge crown preserves endpoints, slope limits and shared reverse geometry',()=>{
  const points=Array.from({length:51},(_,i)=>[i*4,10+i*.04,0]),section={id:'bridge:test',kind:'crossing',points,deckStart:10,deckEnd:40,width:16},road={id:'road',width:16,points,sections:[section]};
  const result=archRoad(road),s=result.sections[0];
  assert.deepEqual(s.points[0],points[0]);assert.deepEqual(s.points.at(-1),points.at(-1));assert.ok(s.points[25][1]>points[25][1]+1);
  assert.equal(section.points,points);assert.equal(points[25][1],11);
  for(let i=1;i<s.points.length;i++)assert.ok(Math.abs(s.points[i][1]-s.points[i-1][1])/4<=.05);
  assert.deepEqual(archRoad(result),result);
  const reversed=archRoad({...road,sections:[{...section,points:points.toReversed()}]}).sections[0].points.toReversed();
  for(let i=0;i<points.length;i++)assert.ok(Math.abs(s.points[i][1]-reversed[i][1])<1e-10);
  const view=createCityView(new THREE.Scene());view.rebuild(0,0,{regions:[],lots:[],parks:[],legacy:[],roads:[result]},[]);
  for(const p of s.points)assert.ok(Math.abs(view.surface(p[0],p[2])-p[1])<1e-8);
});
test('compatibility links and ordinary roads remain unchanged',()=>{
  const road={points:[[0,0,0],[20,0,0]],sections:[{kind:'crossing',compatibility:true,points:[[0,0,0],[20,0,0]]}]};
  assert.equal(archRoad(road).sections[0],road.sections[0]);assert.equal(archRoad({id:'land'}).id,'land');
});
