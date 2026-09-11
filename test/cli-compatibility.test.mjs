import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchAuthoring,CLI_VERSION} from '../cli/compatibility.mjs';
import {run} from '../cli/openworld.mjs';
const manifest={schemaVersion:1,revision:'test',cli:{latestVersion:'1.9.0',minimumVersion:'1.0.0',protocolVersion:1},rules:{maxBytes:100},modelRules:'Current modeling rules'};
test('compatible clients accept newer releases and fetch without credentials',async t=>{
  t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'https://example.com/api/cli/authoring');assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.headers.Cookie,undefined);return Response.json(manifest);});
  assert.equal((await fetchAuthoring('https://example.com')).cli.latestVersion,'1.9.0');assert.equal(CLI_VERSION,'1.2.0');
});
test('incompatible and malformed contracts stop commands',async t=>{
  t.mock.method(globalThis,'fetch',async()=>Response.json({...manifest,cli:{...manifest.cli,minimumVersion:'2.0.0'}}));
  await assert.rejects(fetchAuthoring('https://example.com'),/Update.*github.com/);
  globalThis.fetch=async()=>Response.json({...manifest,cli:{...manifest.cli,protocolVersion:2}});
  await assert.rejects(fetchAuthoring('https://example.com'),/Update/);
  globalThis.fetch=async()=>Response.json({});await assert.rejects(fetchAuthoring('https://example.com'),/Invalid/);
});
test('only legacy 404 is optional; required rules and network failures cannot silently fall back',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response('',{status:404}));
  assert.equal(await fetchAuthoring('https://example.com'),null);
  await assert.rejects(fetchAuthoring('https://example.com',{required:true}),/live modeling rules/);
  globalThis.fetch=async()=>new Response('',{status:503});await assert.rejects(fetchAuthoring('https://example.com'),/503/);
});
test('incompatible login stops before sending credentials or starting authorization',async t=>{
  const calls=[];t.mock.method(globalThis,'fetch',async(url,options)=>{calls.push({url,options});return Response.json({...manifest,cli:{...manifest.cli,minimumVersion:'9.0.0'}});});
  await assert.rejects(run(['login','--server','https://example.com','--no-browser']),/incompatible/);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://example.com/api/cli/authoring');assert.equal(calls[0].options.body,undefined);
});
