import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';
import {testSession} from './auth-fixture.mjs';

test('owner deletion releases land, removes versions and drafts, and preserves avatars and neighbors',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'delete-plot-')),config={dataDir:dir,url:'http://127.0.0.1:8787',adminIds:[]}, {app,store}=(await createApp(config));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
  try{
    const owner=(await testSession(store)),other=(await testSession(store,'1002'));(await store.claim('1001',-7,1));
    const edit=(auth,body)=>fetch(base+'/api/plots/mine',{method:'PATCH',headers:{Origin:config.url,Cookie:auth.cookie,'X-CSRF-Token':auth.csrf,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await edit(other,{name:'Other',description:''})).status,404);
    assert.equal((await edit(owner,{name:'',description:''})).status,400);
    assert.equal((await edit(owner,{name:'My garden',description:'A quiet garden.'})).status,200);
    const publicPlot=(await store.world(-7,1,1)).find(p=>p.owner==='1001');assert.equal(publicPlot.name,'My garden');assert.equal(publicPlot.description,'A quiet garden.');
    (await store.db.prepare('INSERT INTO plots(x,z,owner) VALUES (?,?,?)').run(900,900,'1002'));
    const published=(await store.submit('1001','Published',{}));(await store.review(published.id,'1001',true,''));const pending=(await store.submit('1001','Pending',{}));
    (await store.db.prepare('INSERT INTO model_drafts(id,owner,title,metrics,created,plot_x,plot_z) VALUES (?,?,?,?,?,?,?)').run('draft','1001','Draft','{}',0,-7,1));
    (await store.db.prepare('INSERT INTO avatars VALUES (?,?,?)').run('1001','avatar','{}'));
    for(const id of [published.id,pending.id,'draft','avatar'])writeFileSync(join(dir,'uploads',id+'.glb'),'fixture');
    const remove=headers=>fetch(base+'/api/plots/mine',{method:'DELETE',headers:{Origin:config.url,...headers}}),headers={Cookie:owner.cookie,'X-CSRF-Token':owner.csrf};
    assert.equal((await remove({})).status,401);assert.equal((await remove({Cookie:owner.cookie})).status,403);
    const revision=store.plotRevision('1001');assert.equal((await remove(headers)).status,200);assert.equal(store.plotRevision('1001'),revision+1);
    assert.equal((await store.getPlot('1001')),undefined);assert.ok((await store.getPlot('1002')));assert.equal((await store.getSubmission(pending.id)),undefined);
    for(const id of [published.id,pending.id,'draft'])assert.equal(existsSync(join(dir,'uploads',id+'.glb')),false);
    assert.equal(existsSync(join(dir,'uploads','avatar.glb')),true);assert.ok((await store.db.prepare('SELECT 1 FROM avatars WHERE owner=?').get('1001')));
    assert.equal((await fetch(base+'/assets/'+published.id+'.glb')).status,404);
    assert.equal((await remove(headers)).status,404);(await assert.rejects(async ()=>(await store.review(pending.id,'1001',true,''))));
    assert.ok((await store.claim('1001',-7,1)));assert.equal((await store.db.prepare('SELECT count(*) n FROM model_drafts').get()).n,0);
  }finally{await new Promise(r=>server.close(r));(await store.close());rmSync(dir,{recursive:true,force:true});}
});
