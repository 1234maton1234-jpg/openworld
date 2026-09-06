import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
test('OAuth exchanges a single-use state for a local session with minimal identity access',async t=>{
  const data=mkdtempSync(join(tmpdir(),'openworld-oauth-')),config={dataDir:data,demo:false,production:false,url:'http://127.0.0.1:8787',adminIds:[],clientId:'test-client',clientSecret:'test-secret'},nativeFetch=globalThis.fetch;
  let exchanges=0;t.mock.method(globalThis,'fetch',async(url,options)=>{if(url==='https://github.com/login/oauth/access_token'){exchanges++;const body=options.body;assert.equal(body.get('redirect_uri'),config.url+'/auth/github/callback');assert.ok(body.get('code_verifier'));return Response.json({access_token:'test-access'});}if(url==='https://api.github.com/user')return Response.json({id:12345,login:'test-user'});return nativeFetch(url,options);});
  const {app,store}=(await createApp(config)),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
  try{const start=await fetch(base+'/auth/github',{redirect:'manual'}),target=new URL(start.headers.get('location')),cookie=start.headers.get('set-cookie').split(';')[0];assert.equal(target.origin,'https://github.com');assert.equal(target.searchParams.get('code_challenge_method'),'S256');assert.equal(target.searchParams.has('scope'),false);const callback=base+'/auth/github/callback?code=test-code&state='+target.searchParams.get('state');const login=await fetch(callback,{headers:{Cookie:cookie},redirect:'manual'});assert.equal(login.headers.get('location'),'/game');const sessionCookie=login.headers.getSetCookie().find(v=>v.startsWith('town_session=')).split(';')[0];const session=await (await fetch(base+'/api/session',{headers:{Cookie:sessionCookie}})).json();assert.equal(session.user.login,'test-user');assert.ok(session.csrf);await fetch(callback,{headers:{Cookie:cookie},redirect:'manual'});assert.equal(exchanges,1);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));(await store.close());rmSync(data,{recursive:true,force:true});}
});
