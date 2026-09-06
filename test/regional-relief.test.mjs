import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrbanTerrain} from '../shared/urban-terrain.mjs';
import {createCoastalHydrology} from '../shared/coastal-hydrology.mjs';
test('regional highlands and lowlands differ by tens of metres without steep ordinary roads',()=>{
  const water=createCoastalHydrology(),field=createUrbanTerrain([],water,{version:3,reliefFrozen:[]}),heights=[],slopes=[];
  for(let x=-18000;x<=18000;x+=160)for(let z=-18000;z<=18000;z+=160){const h=field.base(x,z);heights.push(h);slopes.push(Math.hypot(field.base(x+1,z)-h,field.base(x,z+1)-h));}
  const span=Math.max(...heights)-Math.min(...heights);assert.ok(span>45,`range ${span}`);assert.ok(Math.max(...slopes)<.05);slopes.sort((a,b)=>a-b);assert.ok(slopes[Math.floor(slopes.length*.95)]>.012);
});
test('saved districts and their roads retain elevations while new relief joins continuously',()=>{
  const water=createCoastalHydrology(),old=createUrbanTerrain([],water),field=createUrbanTerrain([],water,{version:3,reliefFrozen:[[-560,-560,560,560]]});
  for(let x=-560;x<=560;x+=40){assert.equal(field.base(x,120),old.base(x,120));assert.equal(field.height(x,120),old.height(x,120));}
  for(let x=560;x<=13000;x+=40){const h=field.base(x,200);assert.ok(Math.abs(field.base(x+.01,200)-h)<.001);assert.ok(Math.hypot(field.base(x+1,200)-h,field.base(x,201)-h)<.05);}
});
