import test from 'node:test';
import assert from 'node:assert/strict';
import {WEATHER_PERIOD,WEATHER_SEQUENCE,weatherAt} from '../src/weather.mjs';

test('global weather schedule exposes every supported weather type',()=>{
  const types=new Set(WEATHER_SEQUENCE.map((_,index)=>weatherAt(index*WEATHER_PERIOD+60000).type));
  assert.deepEqual(types,new Set(['clear','partly-cloudy','overcast','fog','rain','storm','snow']));
});

test('weather changes blend smoothly at the start of each period',()=>{
  const before=weatherAt(WEATHER_PERIOD-1),start=weatherAt(WEATHER_PERIOD),settled=weatherAt(WEATHER_PERIOD+60000);
  assert.equal(start.previous,before.type);
  assert.equal(start.mix,0);
  assert.equal(settled.mix,1);
  assert.equal(settled.type,WEATHER_SEQUENCE[1]);
});

test('weather schedule is stable for timestamps before the epoch',()=>{
  const state=weatherAt(-1);
  assert.ok(WEATHER_SEQUENCE.includes(state.type));
  assert.ok(state.mix>=0&&state.mix<=1);
});
