import {testSession} from './auth-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../server/store.mjs';
import {validateModel} from '../server/validate.mjs';
import {Document,NodeIO} from '@gltf-transform/core';
import {createApp} from '../server/app.mjs';
import {createLandCheck} from '../shared/land-check.mjs';

test('land without road frontage is buildable with a nullable entrance',()=>{
  const store=createStore(':memory:');
  try{
    const plan={...store.planner.around(0,0),roads:[],legacy:[]};let polygon,land;
    for(const lot of plan.lots){const x=Math.round(lot.cx/2)*2,z=Math.round(lot.cz/2)*2,p=[[x-16,z-16],[x+16,z-16],[x+16,z+16],[x-16,z+16]];try{land=createLandCheck(plan)(p);polygon=p;break;}catch{}}
    assert.ok(land);assert.equal(land.entrance,null);assert.ok(Number.isFinite(land.elevation));
    const neighbor=gap=>({polygon:polygon.map(([x,z])=>[x-32-gap,z])});
    assert.ok(createLandCheck(plan,[neighbor(2)])(polygon).buildable);
    for(const gap of [1,0,-2])assert.throws(()=>createLandCheck(plan,[neighbor(gap)])(polygon),/至少 2 米/);
    assert.ok(createLandCheck({...plan,legacy:[neighbor(2)]})(polygon).buildable);
    assert.throws(()=>createLandCheck({...plan,legacy:[neighbor(0)]})(polygon),/至少 2 米/);
    const [x,z]=polygon[0];plan.roads=[{id:'distant',width:10,points:[[x-40,land.elevation,z-80],[x-40,land.elevation,z+80]]}];
    assert.equal(createLandCheck(plan)(polygon).entrance,null);
    plan.roads=[{id:'blocked',width:10,points:[[x+16,land.elevation,z-80],[x+16,land.elevation,z+80]]}];
    assert.throws(()=>createLandCheck(plan)(polygon),/道路/);
  }finally{store.close();}
});
test('polygon claims persist exact geometry and reject competing owners and legacy overlap',()=>{
  const store=createStore(':memory:');try{const plan=store.planner.around(0,0);let polygon;
    for(const lot of plan.lots){const x=Math.round(lot.cx/2)*2,z=Math.round(lot.cz/2)*2,p=[[x-32,z-24],[x-24,z-32],[x+24,z-32],[x+32,z-24],[x+32,z+24],[x+24,z+32],[x-24,z+32],[x-32,z+24]];try{store.checkLand(p);polygon=p;break;}catch{}}
    assert.ok(polygon,'a buildable roadside polygon must exist');store.upsertUser('a','a');store.upsertUser('b','b');const plot=store.claimLand('a',polygon);
    assert.deepEqual(plot.polygon,polygon);assert.equal(plot.polygon.length,8);assert.ok(plot.area<4096);assert.deepEqual(store.getPlot('a'),plot);
    assert.throws(()=>store.claimLand('b',polygon),/公共通道/);assert.throws(()=>store.claimLand('a',polygon),/每个账号/);
    assert.deepEqual(store.world(Math.round(plot.cx/70),Math.round(plot.cz/70),4)[0].polygon,polygon);
  }finally{store.close();}
});
test('model validation rejects a triangle crossing a concave notch after scene transforms',async()=>{
  const plot={cx:0,cz:0,width:64,depth:64,polygon:[[-32,-32],[32,-32],[32,0],[0,0],[0,32],[-32,32]]};
  async function model(points){const d=new Document(),buffer=d.createBuffer(),pos=d.createAccessor().setType('VEC3').setArray(new Float32Array(points)).setBuffer(buffer);d.createScene().addChild(d.createNode().setTranslation([100,0,100]).setMesh(d.createMesh().addPrimitive(d.createPrimitive().setAttribute('POSITION',pos))));return Buffer.from(await new NodeIO().writeBinary(d));}
  await validateModel(await model([-24,0,-24,24,0,-24,-24,0,24]),plot);
  await assert.rejects(validateModel(await model([-24,0,24,24,0,-24,24,0,24]),plot),/多边形/);
});
test('authenticated HTTP polygon claim is revalidated and visible to visitors',async()=>{
  const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),dir=mkdtempSync(join(tmpdir(),'polygon-api-'));
  const config={dataDir:dir,production:false,url:'http://127.0.0.1:8787',adminIds:[]},{app,store}=createApp(config),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
  try{let polygon;for(const lot of store.planner.around(0,0).lots){const x=Math.round(lot.cx/2)*2,z=Math.round(lot.cz/2)*2,p=[[x-32,z-32],[x+32,z-32],[x+32,z+32],[x-32,z+32]];try{store.checkLand(p);polygon=p;break;}catch{}}assert.ok(polygon);
    const auth=testSession(store),cookie=auth.cookie,headers={Origin:config.url,Cookie:cookie,'X-CSRF-Token':auth.csrf,'Content-Type':'application/json'};
    const bad=await fetch(base+'/api/plots/claim',{method:'POST',headers,body:JSON.stringify({polygon:[[0,0],[40,40],[0,40],[40,0]]})});assert.equal(bad.status,400);
    const response=await fetch(base+'/api/plots/claim',{method:'POST',headers,body:JSON.stringify({polygon})}),plot=await response.json();assert.equal(response.status,201,JSON.stringify(plot));assert.deepEqual(plot.polygon,polygon);
    const publicWorld=await (await fetch(base+`/api/world?x=${Math.round(plot.cx/70)}&z=${Math.round(plot.cz/70)}`)).json();assert.deepEqual(publicWorld.plots[0].polygon,polygon);assert.equal(publicWorld.planning.lots.length,0);
    store.db.exec('PRAGMA wal_checkpoint(FULL)');const second=createStore(join(dir,'town.sqlite'));try{assert.deepEqual(second.getPlot(plot.owner).polygon,polygon);}finally{second.close();}
  }finally{await new Promise(r=>server.close(r));store.close();rmSync(dir,{recursive:true,force:true});}
});
