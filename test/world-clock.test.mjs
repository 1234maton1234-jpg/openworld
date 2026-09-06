import test from 'node:test';
import assert from 'node:assert/strict';
import {worldHour} from '../src/world-clock.mjs';
test('world day lasts one real hour and is independent of joining time',()=>{
  assert.equal(worldHour(0),0);assert.equal(worldHour(1800000),12);
  assert.equal(worldHour(2500),1/60);assert.equal(worldHour(3600000),0);
  assert.equal(worldHour(1800000+3600000*100),12);
  assert.equal(worldHour(-150000),23);
});
