import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createApp} from '../server/app.mjs';
import {testSession} from './auth-fixture.mjs';
test('skill context returns owned geometry and rules without leaking session credentials',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'skill-context-')),config={dataDir:dir,url:'http://127.0.0.1:8787',adminIds:[]},{app,store}=(await createApp(config)),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try{const auth=(await testSession(store)),url='http://127.0.0.1:'+server.address().port,path=join(dir,'credentials.json');(await store.claim('1001',-7,1));writeFileSync(path,JSON.stringify({server:url,...auth}));
    const {stdout}=await promisify(execFile)(process.execPath,[resolve('skills/openworld-builder/scripts/context.mjs'),'--config',path]);const result=JSON.parse(stdout);assert.equal(result.user.id,'1001');assert.equal(result.localPolygon.length,4);assert.equal(result.rules.maxTriangles,100000);assert.ok(!stdout.includes(auth.csrf));assert.ok(!stdout.includes(auth.cookie));
    assert.match(result.authoring.modelRules,/steering-wheel/);assert.match(result.authoring.modelRules,/vehicle.seats/);assert.match(result.authoring.revision,/^[a-f0-9]{64}$/);
    const response=await fetch(url+'/api/cli/authoring');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const contract=await response.json();assert.equal(contract.revision,result.authoring.revision);assert.equal(contract.vehicles.car.width,1.9);
    const rules=await promisify(execFile)(process.execPath,[resolve('skills/openworld-builder/scripts/openworld.mjs'),'rules','--server',url,'--config',join(dir,'missing.json')]);assert.equal(JSON.parse(rules.stdout).revision,contract.revision);assert.equal(rules.stderr,'');
  }finally{await new Promise(r=>server.close(r));(await store.close());rmSync(dir,{recursive:true,force:true});}
});
