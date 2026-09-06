import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {overlaps} from '../shared/city-plan.mjs';
import {generateNaturalRegion} from '../shared/natural-plan.mjs';
import {createHydrology} from '../shared/hydrology.mjs';
import {createUrbanTerrain} from '../shared/urban-terrain.mjs';
import {cityHeight} from '../shared/city-plan.mjs';

test('a fresh world uses the latest generator at the origin with no legacy masks',async ()=>{
  const s=(await createStore(':memory:'));try{const p=(await s.planner.around(0,0));assert.ok(p.regions.every(r=>r.version===7));assert.deepEqual(p.terrain.frozen,[]);assert.deepEqual(p.hydrology.frozen,[]);assert.deepEqual(p.legacy,[]);assert.equal((await s.world(0,0,4)).length,0);const lot=p.lots.filter(l=>Math.hypot(l.cx,l.cz)<560).sort((a,b)=>Math.hypot(a.cx,a.cz)-Math.hypot(b.cx,b.cz))[0];assert.ok(lot);(await s.upsertUser('fresh','fresh'));assert.equal((await s.claim('fresh',lot.x,lot.z)).owner,'fresh');}finally{(await s.close());}
});
test('planning is persisted before claims and is unchanged across restart',async ()=>{
  const dir=mkdtempSync(join(tmpdir(),'city-plans-')),path=join(dir,'town.sqlite');let s;
  try{s=(await createStore(path));const first=(await s.planner.around(-7,1));assert.equal(first.regions.length,9);const count=(await s.db.prepare('SELECT count(*) n FROM city_regions').get()).n;
    (await s.planner.around(-7,1));assert.equal((await s.db.prepare('SELECT count(*) n FROM city_regions').get()).n,count);
    const lot=first.lots[0];(await s.upsertUser('builder','builder'));const claimed=(await s.claim('builder',lot.x,lot.z));assert.equal(claimed.elevation,lot.elevation);assert.equal(claimed.cx,lot.cx);
    const raw=(await s.db.prepare('SELECT plan FROM city_regions ORDER BY x,z').all());(await s.close());s=(await createStore(path));assert.deepEqual((await s.db.prepare('SELECT plan FROM city_regions ORDER BY x,z').all()),raw);assert.deepEqual((await s.getPlot('builder')),claimed);
    for(let i=0;i<first.lots.length;i++)for(let j=i+1;j<first.lots.length;j++)assert.equal(overlaps(first.lots[i],first.lots[j],6),false);
    (await s.planner.around(32,32));assert.ok((await s.db.prepare('SELECT count(*) n FROM city_regions').get()).n>count);
  }finally{(await s?.close());rmSync(dir,{recursive:true,force:true});}
});
test('legacy parcel height and published building survive city adoption',async ()=>{
  const dir=mkdtempSync(join(tmpdir(),'city-legacy-')),path=join(dir,'town.sqlite');let s;
  try{s=(await createStore(path));(await s.upsertUser('old','old'));(await s.db.exec("INSERT INTO plots(x,z,owner,published,elevation,cx,cz) VALUES(2,0,'old','asset-id',12.3,140,0); DELETE FROM world_meta WHERE key='city-terrain'"));(await s.close());
    s=(await createStore(path));const p=(await s.getPlot('old'));assert.equal(p.elevation,12.3);assert.equal(p.cx,140);assert.equal(p.published,'asset-id');
    const world=(await s.planner.around(0,0));assert.ok(world.legacy.some(l=>l.x===2&&l.elevation===12.3));for(const l of world.lots)assert.equal(overlaps(l,{cx:140,cz:0,width:64,depth:64},12),false);
  }finally{(await s?.close());rmSync(dir,{recursive:true,force:true});}
});

test('urban upgrade freezes old plans and persists new parcel claims without terrain drift',async ()=>{
  const dir=mkdtempSync(join(tmpdir(),'urban-upgrade-')),path=join(dir,'town.sqlite');let s;
  try{
    s=(await createStore(path));const water=createHydrology(JSON.parse((await s.db.prepare("SELECT value FROM world_meta WHERE key='hydrology-v2'").get()).value)),old=generateNaturalRegion(20,20,[],water),raw=JSON.stringify(old);
    (await s.db.prepare('INSERT INTO city_regions VALUES (?,?,?,?)').run(20,20,old.version,raw));(await s.db.exec("DELETE FROM world_meta WHERE key IN ('urban-terrain-v2','coastal-hydrology-v3','coastal-plan-v6','street-plan-v7')"));(await s.close());s=(await createStore(path));
    const world=(await s.planner.around(170,170)),field=createUrbanTerrain(world.terrain.frozen,water);
    assert.equal((await s.db.prepare('SELECT plan FROM city_regions WHERE x=20 AND z=20').get()).plan,raw);
    const [l,b,r,t]=old.bounds;assert.equal(field.height((l+r)/2,(b+t)/2),cityHeight((l+r)/2,(b+t)/2,water));
    const lot=world.lots.find(p=>p.version===7);assert.ok(lot);(await s.upsertUser('new-owner','new-owner'));const claim=(await s.claim('new-owner',lot.x,lot.z)),config=JSON.stringify(world.terrain);
    (await s.close());s=(await createStore(path));assert.deepEqual((await s.getPlot('new-owner')),claim);assert.equal(JSON.stringify((await s.planner.around(170,170)).terrain),config);
  }finally{(await s?.close());rmSync(dir,{recursive:true,force:true});}
});
