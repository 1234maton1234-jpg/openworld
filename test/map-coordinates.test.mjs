import test from 'node:test';
import assert from 'node:assert/strict';
import {mapPoint,zoomMap} from '../src/map-coordinates.mjs';
test('north is negative Z, independent of world origin',()=>{const view={x:70000,z:-14000,scale:.5};assert.deepEqual(mapPoint(70000,-14000,view,400,300),[200,150]);assert.deepEqual(mapPoint(70020,-14020,view,400,300),[210,140]);});
test('zoom preserves the world point underneath the cursor including clamp',()=>{let view={x:120,z:-90,scale:.2};const target=[370,110];const point=[view.x+(target[0]-400)/view.scale,view.z+(target[1]-300)/view.scale];for(const factor of [1.4,100,.00001]){view=zoomMap(view,factor,...target,800,600);const screen=mapPoint(...point,view,800,600);assert.ok(Math.abs(screen[0]-target[0])<1e-8);assert.ok(Math.abs(screen[1]-target[1])<1e-8);}});
