import test from 'node:test';
import assert from 'node:assert/strict';
import {refineShoreNetwork} from '../shared/shore-network.mjs';
const road=(id,points,bridge=false)=>({id,width:18,points:points.map(([x,z])=>[x,4,z]),bridge,sections:[{kind:bridge?'crossing':'land',points:points.map(([x,z])=>[x,4,z])}]});
const water={distance:()=>100};
test('tiny shore loops collapse while retaining an alternative connection',()=>{const roads=[road('a',[[0,0],[64,0]]),road('b',[[64,0],[64,64]]),road('c',[[0,0],[64,64]])];const result=refineShoreNetwork(roads,water);assert.equal(result.length,2);assert.ok(result.some(r=>r.points.some(p=>p[0]===0)));assert.ok(result.some(r=>r.points.some(p=>p[2]===64)));});
test('bridgehead cleanup removes only empty short terminal branches',()=>{
  const roads=[road('bridge',[[0,0],[100,0]],true),road('bank',[[-100,0],[0,0]]),road('branch',[[0,0],[0,100]]),road('tail',[[0,0],[0,-24]])];
  const result=refineShoreNetwork(roads,water);assert.ok(!result.some(r=>r.id==='tail'));assert.deepEqual(result.find(r=>r.bridge),roads[0]);assert.ok(result.some(r=>r.id==='branch'));
  const protectedResult=refineShoreNetwork(roads,water,[{cx:50,cz:-24,width:20,depth:20,entrance:{points:[[40,4,-24],[0,4,-24]]}}]);assert.ok(protectedResult.some(r=>r.id==='tail'));
});
test('shore simplification preserves endpoints and refuses wet shortcuts',()=>{
  const r=road('bank',[[0,0],[32,0],[64,16],[96,16],[128,32]]),out=refineShoreNetwork([r],water)[0];assert.ok(out.points.length<r.points.length);assert.deepEqual(out.points[0],r.points[0]);assert.deepEqual(out.points.at(-1),r.points.at(-1));
  const wet={distance:(x,z)=>x>30&&x<60&&z>2?0:100};const safe=refineShoreNetwork([r],wet)[0];assert.ok(safe.points.length>=3);
});
test('refinement is order independent and leaves inland roads alone',()=>{const roads=[road('a',[[0,0],[32,0],[64,16]]),road('b',[[64,16],[64,80]])];assert.deepEqual(refineShoreNetwork(roads,water),refineShoreNetwork([...roads].reverse(),water));assert.deepEqual(refineShoreNetwork(roads,{distance:()=>200}),roads);});
