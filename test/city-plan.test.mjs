import test from 'node:test';
import assert from 'node:assert/strict';
import {generateRegion,validateRegion,cityHeight,roadHeight,axis,riverDistance} from '../shared/city-plan.mjs';
test('city regions are deterministic, connected and buildable',()=>{
  for(const [x,z] of [[0,0],[-2,-3],[5,8],[2000000,-2000000]]){
    const a=generateRegion(x,z);assert.deepEqual(a,generateRegion(x,z));assert.deepEqual(validateRegion(a),[]);
    for(const lot of a.lots){assert.ok(lot.relief<=1);assert.ok(lot.entrance);}
  }
});
test('neighbor regions share identical road geometry at boundaries',()=>{
  for(let x=-3;x<3;x++){const a=generateRegion(x,2),b=generateRegion(x+1,2);const common=a.roads.filter(r=>b.roads.some(s=>s.id===r.id));assert.ok(common.length>=2);for(const r of common)assert.deepEqual(r,b.roads.find(s=>s.id===r.id));}
});
test('ordinary urban ground and roads have gentle slopes without region steps',()=>{
  for(let x=-2000;x<=2000;x+=37)for(let z=-1200;z<=1200;z+=41){const h=cityHeight(x,z),s=Math.hypot(cityHeight(x+.1,z)-h,cityHeight(x,z+.1)-h)/.1;if(riverDistance(x,z)>42)assert.ok(s<=.03,`slope ${s} at ${x},${z}`);assert.ok(Math.abs(roadHeight(x+1,z)-roadHeight(x,z))<=.05);}
  for(let i=-10;i<=10;i++){const x=axis(i);assert.ok(Math.abs(cityHeight(x-.001,900)-cityHeight(x+.001,900))<.001);}
});
