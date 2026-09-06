import test from 'node:test';
import assert from 'node:assert/strict';
import {createStreetCollision} from '../src/street-collision.mjs';
test('lamp collision covers pole and footing at absolute coordinates and separates bridge heights',()=>{const c=createStreetCollision();c.set([{p:[-16,4,70000]}]);assert.equal(c.blocked(-16,70000,4),true);assert.equal(c.blocked(-15.5,70000,4),true);assert.equal(c.blocked(-15.5,70000,5),false);assert.equal(c.blocked(-14,70000,4,.95),false);assert.equal(c.blocked(-16,70000,0),false);assert.equal(c.blocked(-16,70000,13),false);assert.equal(c.blocked(-16.9,70000,4,.95),true);});
test('replacing street furniture removes stale colliders',()=>{const c=createStreetCollision();c.set([{p:[0,4,0]}]);assert.equal(c.blocked(0,0,4),true);c.set([{p:[70,4,0]}]);assert.equal(c.blocked(0,0,4),false);assert.equal(c.blocked(70,0,4),true);c.set([]);assert.equal(c.blocked(70,0,4),false);});
