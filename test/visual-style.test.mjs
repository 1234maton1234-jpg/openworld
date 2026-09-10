import test from 'node:test';
import assert from 'node:assert/strict';
import {cyberpunkPreferred} from '../src/cyberpunk.mjs';

test('original rendering is default until cyberpunk is explicitly selected',()=>{
  assert.equal(cyberpunkPreferred({getItem:()=>null}),false);
  assert.equal(cyberpunkPreferred({getItem:()=> 'natural'}),false);
  assert.equal(cyberpunkPreferred({getItem:()=> 'cyberpunk'}),true);
  assert.equal(cyberpunkPreferred({getItem(){throw new Error('blocked');}}),false);
});
