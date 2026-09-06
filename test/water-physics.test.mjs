import test from 'node:test';
import assert from 'node:assert/strict';
import {WaterField} from '../shared/water-physics.mjs';
test('water impulse propagates and loses energy over time',()=>{const w=new WaterField(41,40);w.reset(()=>1.2);w.disturb(0,0,1.5);for(let i=0;i<120;i++)w.step(1/60);assert.ok(Math.abs(w.sample(5,0).height)>.0001);const energy=w.energy();for(let i=0;i<1800;i++)w.step(1/60);assert.ok(w.energy()<energy*.15);});
test('dry shore blocks waves and invalid timesteps cannot destabilize the field',()=>{const w=new WaterField(33,32);w.reset((x)=>x>0?0:1);assert.equal(w.disturb(8,0,1),false);w.disturb(-4,0,1);for(let i=0;i<120;i++)w.step(1);assert.equal(w.sample(4,0).height,0);assert.ok(w.height.every(Number.isFinite));assert.ok(w.energy()<100);});
