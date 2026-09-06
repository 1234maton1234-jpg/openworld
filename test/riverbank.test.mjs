import test from 'node:test';
import assert from 'node:assert/strict';
import {riverbankHeight} from '../shared/riverbank.mjs';
import {createUrbanTerrain} from '../shared/urban-terrain.mjs';
test('road embankments stay continuous at shoreline and spatial index boundaries',()=>{
  const water={distance:()=>60},field=createUrbanTerrain([],water),roads=[{width:28,points:[[-200,50.035,0],[200,50.035,0]],sections:[{kind:'land',points:[[-200,50.035,0],[200,50.035,0]]}]}];
  let previous=field.ground(0,0,[],[],roads);
  assert.ok(Math.abs(previous-50)<1e-8);
  for(let z=.5;z<=260;z+=.5){const h=field.ground(0,z,[],[],roads);assert.ok(Math.abs(h-previous)<.5,`steep edge at ${z}`);previous=h;}
  const coastal=createUrbanTerrain([],{distance:(x,z)=>z});
  const before=coastal.ground(0,41.99,[],[],roads),after=coastal.ground(0,42.01,[],[],roads);
  assert.ok(Math.abs(after-before)<.1);
});
test('arched crossings do not raise terrain beneath the bridge',()=>{
  const field=createUrbanTerrain([],{distance:()=>60}),points=[[-100,40,0],[0,50,0],[100,40,0]],roads=[{width:28,points,sections:[{kind:'crossing',points}]}];
  assert.equal(field.ground(0,0,[],[],roads),field.ground(0,0));
});
test('riverbank has a low terrace and widens the upper slope for high terrain',()=>{
  for(const level of [4,16,40,80]){
    assert.equal(riverbankHeight(14,level),-1.5);assert.equal(riverbankHeight(32,level),1.2);assert.equal(riverbankHeight(36,level),1.2);assert.equal(riverbankHeight(200,level),level);
    let previous=-1.5,maxSlope=0;for(let d=14.25;d<=200;d+=.25){const h=riverbankHeight(d,level);assert.ok(h>=previous-1e-8);maxSlope=Math.max(maxSlope,(h-previous)/.25);previous=h;}
    assert.ok(maxSlope<1.5*(level+1.5)/24*.8);
  }
});
