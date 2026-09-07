import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
import {testSession} from './auth-fixture.mjs';
import {normalizeOrigins} from '../server/origins.mjs';
import {get} from 'node:http';
const getHost=(url,host)=>new Promise((resolve,reject)=>get(url,{headers:{Host:host}},res=>{res.resume();res.on('end',()=>resolve({headers:new Headers(res.headers)}));}).on('error',reject));

test('aliases allow authenticated writes, retain CSRF and redirect OAuth to canonical host',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'domain-origin-')),config={dataDir:dir,url:'https://world.example',allowedOrigins:['https://legacy.example'],adminIds:[],clientId:'test',clientSecret:'test'};
 const {app,store}=await createApp(config),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  const auth=await testSession(store),headers={Cookie:auth.cookie,Origin:'https://legacy.example'};
  assert.equal((await fetch(base+'/api/logout',{method:'POST',headers})).status,403);
  assert.equal((await fetch(base+'/api/logout',{method:'POST',headers:{...headers,Origin:'https://evil.example','X-CSRF-Token':auth.csrf}})).status,403);
  assert.equal((await fetch(base+'/api/logout',{method:'POST',headers:{...headers,'X-CSRF-Token':auth.csrf}})).status,200);
  const response=await getHost(base+'/auth/github?returnTo=admin&cli=123456789ABC&url=https://evil.example','legacy.example');
  const redirect=new URL(response.headers.get('location'));assert.equal(redirect.origin,config.url);assert.equal(redirect.pathname,'/auth/github');assert.equal(redirect.searchParams.get('returnTo'),'admin');assert.equal(redirect.searchParams.get('cli'),'123456789ABC');assert.equal(response.headers.get('set-cookie'),null);
  const canonical=await getHost(base+'/auth/github','world.example');assert.equal(new URL(canonical.headers.get('location')).searchParams.get('redirect_uri'),config.url+'/auth/github/callback');assert.match(canonical.headers.get('set-cookie'),/town_oauth=/);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await store.close();rmSync(dir,{recursive:true,force:true});}
});
test('origin configuration rejects wildcards, paths and insecure production aliases',()=>{
 assert.deepEqual(normalizeOrigins(['https://world.example/'],true),['https://world.example']);
 for(const value of ['*','https://example.com/path','https://user:pass@example.com','http://example.com','https://example.com?x'])assert.throws(()=>normalizeOrigins([value],true));
});
