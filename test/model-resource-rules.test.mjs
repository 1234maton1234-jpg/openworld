import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectResourceDeclarations,MODEL_RESOURCE_RULES} from '../shared/model-resource-rules.mjs';

test('common resource limits account for decoded sparse data before allocating it',()=>{
  const accessor={count:300000,type:'VEC3',componentType:5126,sparse:{count:1}};
  assert.equal(inspectResourceDeclarations({accessors:[accessor]}).decodedAccessorBytes,3600000);
  assert.throws(()=>inspectResourceDeclarations({accessors:Array(10).fill(accessor)}),/32 MiB/);
  assert.throws(()=>inspectResourceDeclarations({accessors:[{...accessor,count:Infinity}]}),/访问器/);
});
test('materials and clips have shared independent budgets',()=>{
  assert.equal(inspectResourceDeclarations({materials:Array(64),animations:Array(32)}).materials,64);
  assert.throws(()=>inspectResourceDeclarations({materials:Array(MODEL_RESOURCE_RULES.maxMaterials+1)}),/材质/);
  assert.throws(()=>inspectResourceDeclarations({animations:Array(33)}),/动画/);
});
