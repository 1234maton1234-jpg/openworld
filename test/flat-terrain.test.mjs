import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrbanTerrain} from '../shared/urban-terrain.mjs';
import {createCoastalHydrology} from '../shared/coastal-hydrology.mjs';
test('flat terrain keeps buildable land level across the world and preserves riverbeds',()=>{
  const water=createCoastalHydrology(),field=createUrbanTerrain([],water,{version:4});
  let dry=0;for(let x=-12000;x<=12000;x+=600)for(let z=-12000;z<=12000;z+=600){assert.equal(field.base(x,z),4.3);if(water.distance(x,z)>=200){dry++;assert.equal(field.ground(x,z),4.3);}}
  assert.ok(dry>100);for(const z of [-12000,0,12000])assert.ok(field.ground(water.main(0,z).x,z)<0);
});
