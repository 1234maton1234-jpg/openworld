import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrbanTerrain} from '../shared/urban-terrain.mjs';
import {generateUrbanRegion,segmentHitsLot} from '../shared/urban-plan.mjs';
import {createHydrology} from '../shared/hydrology.mjs';
import {cityHeight,roadHeight,validateRegion,axis} from '../shared/city-plan.mjs';
import {generateNaturalRegion} from '../shared/natural-plan.mjs';

test('urban terrain has measurable gentle slopes and preserves saved terrain',()=>{
  const water=createHydrology(),field=createUrbanTerrain([],water),slopes=[],heights=[];
  for(let x=-5000;x<=5000;x+=80)for(let z=-5000;z<=5000;z+=80){
    const h=field.base(x,z);heights.push(h);
    slopes.push(Math.hypot(field.base(x+1,z)-h,field.base(x,z+1)-h));
  }
  slopes.sort((a,b)=>a-b);
  assert.ok(slopes[Math.floor(slopes.length*.5)]>.002);
  assert.ok(slopes.at(-1)<.03);
  assert.ok(Math.max(...heights)-Math.min(...heights)>8);
  const frozen=createUrbanTerrain([[-560,-560,560,560]],water);
  for(let x=-560;x<=560;x+=40){assert.equal(frozen.base(x,120),roadHeight(x,120));assert.equal(frozen.height(x,120),cityHeight(x,120,water));}
  for(const x of [560,640,2000])assert.ok(Math.abs(frozen.height(x-.001,100)-frozen.height(x+.001,100))<.001);
  for(const x of [-1e12,1e12])assert.ok(Number.isFinite(field.base(x,x))&&Math.abs(field.base(x+.01,x)-field.base(x,x))<.001);
});

test('road-first parcels increase usable density without breaking access or shared roads',()=>{
  const water=createHydrology(),field=createUrbanTerrain([],water);let count=0,area=0;
  for(let x=20;x<=24;x++)for(let z=20;z<=24;z++){
    const p=generateUrbanRegion(x,z,[],water,field);assert.deepEqual(validateRegion(p),[]);
    assert.deepEqual(p,generateUrbanRegion(x,z,[],water,field));count+=p.lots.length;area+=(p.bounds[2]-p.bounds[0])*(p.bounds[3]-p.bounds[1]);
    for(const lot of p.lots){assert.equal(Math.floor(lot.x/8),x);assert.equal(Math.floor(lot.z/8),z);assert.ok(lot.relief<=1);
      for(const road of p.roads)for(let i=1;i<road.points.length;i++)assert.equal(segmentHitsLot(road.points[i-1],road.points[i],lot,road.width/2+6),false);
      for(const other of p.lots)if(lot!==other)assert.equal(segmentHitsLot(...lot.entrance.points,other,3),false);
      for(const dx of [-31,0,31])for(const dz of [-31,0,31])assert.equal(field.ground(lot.cx+dx,lot.cz+dz,p.lots,[],p.roads),lot.elevation);
      const [a,b]=lot.entrance.points;for(let t=0;t<=1;t+=.1){const h=field.ground(a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t,p.lots,[],p.roads);assert.ok(h<=a[1]+(b[1]-a[1])*t+.001,'terrain must not bury the entrance');}
    }
    const neighbor=generateUrbanRegion(x+1,z,[],water,field);
    for(const r of p.roads.filter(r=>neighbor.roads.some(n=>n.id===r.id)))assert.deepEqual(r,neighbor.roads.find(n=>n.id===r.id));
  }
  assert.ok(count/25>=10,`only ${count/25} lots per region`);
  assert.ok(count*64*64/area>.12,`coverage ${count*64*64/area}`);
});

test('new roads meet previously saved curved roads at the same height',()=>{
  const water=createHydrology(),old=generateNaturalRegion(10,10,[],water),field=createUrbanTerrain([old.bounds],water);
  const next=generateUrbanRegion(11,10,[],water,field);
  for(const r of old.roads.filter(r=>next.roads.some(n=>n.id===r.id)))assert.deepEqual(r,next.roads.find(n=>n.id===r.id));
  for(const x of [axis(22)-.001,axis(22)+.001])assert.ok(Math.abs(field.base(x,axis(21))-roadHeight(x,axis(21)))<1e-7);
});
