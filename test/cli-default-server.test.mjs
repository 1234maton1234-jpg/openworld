import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {run} from '../cli/openworld.mjs';

test('login defaults to the official site even after local login; explicit servers still work',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'cli-default-')),config=join(dir,'credentials.json');let destination;
  t.mock.method(globalThis,'fetch',async url=>{destination=url;throw new Error('Captured request');});
  const login=async extra=>{await assert.rejects(run(['login','--no-browser','--config',config,...extra]),/Captured request/);return new URL(destination).origin;};
  try{
    assert.equal(await login([]),'https://openworldcraft.com');
    await writeFile(config,JSON.stringify({server:'http://127.0.0.1:8787',cookie:'test',csrf:'test'}));
    assert.equal(await login([]),'https://openworldcraft.com');
    assert.equal(await login(['--server','http://127.0.0.1:8787']),'http://127.0.0.1:8787');
  }finally{await rm(dir,{recursive:true,force:true});}
});
