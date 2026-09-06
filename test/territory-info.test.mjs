import test from 'node:test';
import assert from 'node:assert/strict';
import {territoryAt} from '../src/territory-info.mjs';
test('territory detection follows polygon rather than its bounding rectangle',()=>{
  const plot={owner:'owner',polygon:[[0,0],[20,0],[0,20]]};
  assert.equal(territoryAt([plot],2,2),plot);
  assert.equal(territoryAt([plot],18,18),undefined);
  assert.equal(territoryAt([plot],0,10),plot);
  assert.equal(territoryAt([],2,2),undefined);
});
