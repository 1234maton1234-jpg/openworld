import test from 'node:test';
import assert from 'node:assert/strict';
import {heightAt,riverX,plotTerrain,TERRAIN} from '../shared/terrain.mjs';
test('fixed terrain generates a town clearing, river valley and mountains',()=>{assert.equal(heightAt(0,0),4);assert.ok(heightAt(riverX(300),300)<0);let highest=0;for(let x=-1000;x<1000;x+=50)for(let z=-1000;z<1000;z+=50)highest=Math.max(highest,heightAt(x,z));assert.ok(highest>15&&highest<38);assert.ok(plotTerrain(-2,0).buildable);assert.equal(TERRAIN.version,2);});
test('terrain seed has stable regression samples and continuous chunk borders',()=>{const points=[[-38,76],[19,-19],[38000000,-38000000],[145,224]];assert.deepEqual(points.map(([x,z])=>heightAt(x,z)),[4,4,6.632423,12.342975]);for(const [x,z] of points)assert.ok(Math.abs(heightAt(x,z)-heightAt(x+.0001,z))<.01);});
test('river lots cannot be claimed and foundation bounds include the whole lot',()=>{const z=8,x=Math.round(riverX(z*70)/70),river=plotTerrain(x,z);assert.equal(river.buildable,false);const lot=plotTerrain(-2,0);for(let dx=-32;dx<=32;dx+=2)for(let dz=-32;dz<=32;dz+=2)assert.ok(lot.elevation>=heightAt(-140+dx,dz));});
