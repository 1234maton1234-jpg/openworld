import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/database.mjs';

test('async database rolls back and isolates concurrent transactions',async()=>{
  const db=await openDatabase(':memory:');
  try{
    await db.exec('CREATE TABLE counters(id TEXT PRIMARY KEY,n INTEGER NOT NULL)');
    await db.prepare('INSERT INTO counters VALUES (?,?)').run('value',0);
    await assert.rejects(db.transaction(async()=>{await db.prepare('UPDATE counters SET n=9').run();throw new Error('rollback');}),/rollback/);
    assert.equal((await db.prepare('SELECT n FROM counters').get()).n,0);
    await Promise.all(Array.from({length:8},()=>db.transaction(async()=>{
      const {n}=await db.prepare('SELECT n FROM counters').get();
      await new Promise(r=>setTimeout(r,1));
      await db.prepare('UPDATE counters SET n=?').run(n+1);
    })));
    assert.equal((await db.prepare('SELECT n FROM counters').get()).n,8);
    await db.transaction(async()=>{
      await assert.rejects(db.transaction(async()=>{await db.prepare('UPDATE counters SET n=99').run();throw new Error('nested');}),/nested/);
      assert.equal((await db.prepare('SELECT n FROM counters').get()).n,8);
    });
  }finally{await db.close();}
});
