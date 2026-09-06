import test from 'node:test';
import assert from 'node:assert/strict';
import {createHydrology} from '../shared/hydrology.mjs';
import {riverDistance,validateRegion} from '../shared/city-plan.mjs';
import {generateNaturalRegion} from '../shared/natural-plan.mjs';
test('river field is deterministic, has multiple directions and is not a 1100m repeat',()=>{
 const a=createHydrology(),b=createHydrology(),directions=new Set();let different=0;
 for(let x=-3500;x<=3500;x+=128)for(let z=-3500;z<=3500;z+=128){assert.equal(a.network(x,z),b.network(x,z));if(Math.abs(a.network(x,z)-a.network(x+1100,z))>10)different++;for(const s of a.segments(x,z))directions.add(Math.round(Math.atan2(s.b[1]-s.a[1],s.b[0]-s.a[0])/(Math.PI/4)));}
 assert.ok(different>100);assert.ok(directions.size>=5);
});
test('saved river regions remain unchanged and new districts validate against the river field',()=>{
 const h=createHydrology([[-600,-600,600,600]]);for(let x=-600;x<=600;x+=40)assert.equal(h.distance(x,300),riverDistance(x,300));
 for(const [x,z] of [[20,20],[-12,8],[25,-15]]){const p=generateNaturalRegion(x,z,[],h);assert.deepEqual(validateRegion(p),[]);for(const lot of p.lots)assert.ok(lot.min>=3);}
});
