import test from 'node:test';
import assert from 'node:assert/strict';
import {directedRoute} from '../shared/directed-route.mjs';

test('routing keeps incoming direction and avoids short reverse-turn shortcuts',()=>{
  const points={s:[0,0,0],a:[10,0,0],b:[4,0,2],c:[10,0,10],t:[4,0,10]},links={s:['a'],a:['b','c'],b:['t'],c:['t'],t:[]};
  const path=directedRoute('s','t',id=>points[id],id=>links[id].map(id=>({id})));
  assert.deepEqual(path.map(s=>s.b),[points.a,points.c,points.t]);
});
test('unreachable safe route returns null instead of producing a hairpin',()=>{
  const p={s:[0,0,0],a:[10,0,0],t:[5,0,0]},links={s:['a'],a:['t'],t:[]};
  assert.equal(directedRoute('s','t',id=>p[id],id=>links[id].map(id=>({id}))),null);
});
