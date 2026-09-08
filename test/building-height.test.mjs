import test from 'node:test';
import assert from 'node:assert/strict';
import {Document,NodeIO} from '@gltf-transform/core';
import {validateModel} from '../server/validate.mjs';
import {RULES} from '../server/store.mjs';

async function building(width,height){
  const doc=new Document(),buffer=doc.createBuffer();
  const position=doc.createAccessor().setType('VEC3').setArray(new Float32Array([0,0,0,width,0,0,0,height,1])).setBuffer(buffer);
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION',position))));
  return Buffer.from(await new NodeIO().writeBinary(doc));
}
test('building height is unrestricted in validation and published rules',async()=>{
  assert.equal(JSON.parse(JSON.stringify(RULES)).height,null);
  const result=await validateModel(await building(10,25000));
  assert.equal(result.size[1],25000);
});
test('tall buildings must still fit horizontal plot boundaries',async()=>{
  await assert.rejects(validateModel(await building(65,25000)),/超过宽/);
  const plot={width:20,depth:20,cx:0,cz:0,polygon:[[-10,-10],[10,-10],[0,10]]};
  await assert.rejects(validateModel(await building(20,25000),plot),/超出多边形/);
});
