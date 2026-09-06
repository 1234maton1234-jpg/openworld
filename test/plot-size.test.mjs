import test from 'node:test';
import assert from 'node:assert/strict';
import {RULES} from '../server/store.mjs';
import {TERRAIN,heightAt,plotTerrain} from '../shared/terrain.mjs';
import {createStore} from '../server/store.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('expanded lots cover 64 metres with a six metre gap',()=>{
  assert.equal(RULES.width,64);assert.equal(RULES.depth,64);assert.equal(RULES.height,24);
  assert.equal(TERRAIN.cell,70);assert.equal(RULES.cell-RULES.width,6);
  const lot=plotTerrain(-2,0);assert.ok(lot.buildable);
  for(let x=-32;x<=32;x+=2)for(let z=-32;z<=32;z+=2)assert.ok(lot.elevation>=heightAt(-140+x,z));
  assert.equal(plotTerrain(2,0).buildable,false);
});
test('layout migration preserves ownership and published buildings and runs once',async ()=>{
  const dir=mkdtempSync(join(tmpdir(),'town-layout-')),path=join(dir,'town.sqlite');let s;
  try{
    s=(await createStore(path));(await s.upsertUser('existing','owner'));
    (await s.db.prepare('INSERT INTO plots(x,z,owner,published,elevation) VALUES (2,0,?,?,5.1)').run('existing','building-id'));
    (await s.db.exec("DELETE FROM world_meta WHERE key='plot-layout'"));(await s.close());
    s=(await createStore(path));const row=(await s.getPlot('existing'));
    assert.equal(row.x,2);assert.equal(row.z,0);assert.equal(row.published,'building-id');assert.equal(row.elevation,plotTerrain(2,0).elevation);
    (await s.close());s=(await createStore(path));assert.deepEqual((await s.getPlot('existing')),row);
  }finally{(await s?.close());rmSync(dir,{recursive:true,force:true});}
});
