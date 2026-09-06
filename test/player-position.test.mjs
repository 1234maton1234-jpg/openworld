import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.mjs';
import {createPlayerPositions} from '../server/player-position.mjs';

test('positions survive database reopen and reject inactive, invalid and old-world poses',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'positions-')),path=join(dir,'world.sqlite');let store=await createStore(path);
  try{
    await store.upsertUser('1','player');await store.upsertUser('2','other');
    const positions=await createPlayerPositions(store.db),pose={x:800,y:4.3,z:-350,yaw:1.2,active:true,vehicleType:'car'};
    await positions.save('1',pose);await positions.save('1',{...pose,x:0,active:false});await positions.save('1',{...pose,x:Infinity});
    assert.equal((await positions.load('1')).x,800);assert.equal(await positions.load('2'),null);
    await store.close();store=await createStore(path);const reopened=await createPlayerPositions(store.db),saved=await reopened.load('1');assert.equal(saved.z,-350);assert.equal(saved.yaw,1.2);assert.equal(saved.vehicleType,null);
    await store.db.prepare('UPDATE player_positions SET world=? WHERE owner=?').run('old-world','1');assert.equal(await reopened.load('1'),null);
  }finally{await store.close();rmSync(dir,{recursive:true,force:true});}
});
