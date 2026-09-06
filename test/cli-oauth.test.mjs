import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createApp} from '../server/app.mjs';
import {testSession} from './auth-fixture.mjs';
test('browser approval, denial, expiry, CSRF, one-use redemption and CLI persistence',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'cli-oauth-')),config={dataDir:dir,url:'http://127.0.0.1:8787',adminIds:[],clientId:'test',clientSecret:'test'},{app,store}=(await createApp(config)),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));config.url='http://127.0.0.1:'+server.address().port;
 const auth=(await testSession(store)),headers={Cookie:auth.cookie,'X-CSRF-Token':auth.csrf};
 const post=(path,body,h={})=>fetch(config.url+path,{method:'POST',headers:{Origin:config.url,'Content-Type':'application/json',...h},body:JSON.stringify(body)});
 try{const start=async()=>await(await post('/api/cli/authorize/start',{})).json(),a=await start();assert.equal((await(await post('/api/cli/authorize/poll',{secret:a.secret})).json()).status,'pending');
 assert.equal((await post('/api/cli/authorize/confirm',{code:a.code,approve:true})).status,401);assert.equal((await post('/api/cli/authorize/confirm',{code:a.code,approve:true},{Cookie:auth.cookie})).status,403);
 await post('/api/cli/authorize/confirm',{code:a.code,approve:true},headers);const approved=await post('/api/cli/authorize/poll',{secret:a.secret});assert.equal((await approved.json()).user.id,'1001');assert.ok(approved.headers.get('set-cookie'));assert.equal((await post('/api/cli/authorize/poll',{secret:a.secret})).status,410);
 const denied=await start();await post('/api/cli/authorize/confirm',{code:denied.code,approve:false},headers);assert.equal((await(await post('/api/cli/authorize/poll',{secret:denied.secret})).json()).status,'denied');
 const expired=await start();(await store.db.prepare('UPDATE cli_authorizations SET expires=0 WHERE code=?').run(expired.code));assert.equal((await post('/api/cli/authorize/poll',{secret:expired.secret})).status,410);
 const file=join(dir,'cli.json'),env={...process.env};delete env.OPENWORLD_GITHUB_TOKEN;
 await new Promise((resolveTest,reject)=>{const child=spawn(process.execPath,[resolve('cli/openworld.mjs'),'login','--no-browser','--server',config.url,'--config',file],{env}),timer=setTimeout(()=>{child.kill();reject(Error('CLI timeout'));},15000);let output='',confirmed=false;child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/code=([A-F0-9]{12})/);if(match&&!confirmed){confirmed=true;post('/api/cli/authorize/confirm',{code:match[1],approve:true},headers).catch(reject);}});child.on('exit',code=>{clearTimeout(timer);code===0?resolveTest():reject(Error('CLI failed'));});});
 const saved=JSON.parse(readFileSync(file));assert.equal(saved.server,config.url);assert.ok(saved.cookie);assert.ok(saved.csrf);
 }finally{await new Promise(r=>server.close(r));(await store.close());rmSync(dir,{recursive:true,force:true});}
});
