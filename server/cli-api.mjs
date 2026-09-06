import express from 'express';
import {writeFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {requireUser} from './auth.mjs';
import {fail,RULES} from './store.mjs';
import {validateModel} from './validate.mjs';

export async function installCliApi(app,store,uploads){
  const {db}=store;
  (await db.exec('CREATE TABLE IF NOT EXISTS model_drafts(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,metrics TEXT NOT NULL,created INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS avatars(owner TEXT PRIMARY KEY REFERENCES users(id),id TEXT NOT NULL,metrics TEXT NOT NULL)'));
  let busy=0;
  await db.exec('CREATE TABLE IF NOT EXISTS vehicles(owner TEXT PRIMARY KEY REFERENCES users(id),id TEXT NOT NULL,metrics TEXT NOT NULL)');
  const upload=[requireUser,async (req,res,next)=>{(await store.rate('cli-upload:'+req.user.id,12,3600000));if(busy>=2)fail(503,'模型校验繁忙');busy++;let done=false;req.release=()=>{if(!done){done=true;busy--;}};res.once('finish',req.release);res.once('close',()=>{if(!req.validating)req.release();});next();},express.raw({type:['model/gltf-binary','application/octet-stream'],limit:RULES.maxBytes,inflate:false})];
  app.get('/api/avatar',async (req,res)=>{const row=req.user&&(await db.prepare('SELECT id FROM avatars WHERE owner=?').get(req.user.id));res.json({url:row?'/api/avatar/'+row.id+'.glb':null});});
  app.get('/api/vehicle',async(req,res)=>{const row=req.user&&await db.prepare('SELECT id FROM vehicles WHERE owner=?').get(req.user.id);res.json({id:row?.id||null,url:row?'/api/vehicle/'+row.id+'.glb':null,category:'car'});});
  app.get('/api/vehicle/:id.glb',async(req,res)=>{if(!await db.prepare('SELECT 1 FROM vehicles WHERE id=?').get(req.params.id))fail(404,'载具模型不存在');res.type('model/gltf-binary').sendFile(join(uploads,req.params.id+'.glb'));});
  app.put('/api/vehicle',...upload,async(req,res)=>{req.validating=true;try{
    const metrics=await validateModel(req.body,{width:1.9,depth:4.1});if(metrics.size[1]<.5||metrics.size[1]>2)fail(400,'小汽车模型高度须为 0.5～2 米，宽不超过 1.9 米，长不超过 4.1 米');
    const id=randomUUID();let old;writeFileSync(join(uploads,id+'.glb'),req.body,{flag:'wx'});
    try{await store.transaction(async()=>{old=await db.prepare('SELECT id FROM vehicles WHERE owner=?').get(req.user.id);await db.prepare('INSERT INTO vehicles VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET id=excluded.id,metrics=excluded.metrics').run(req.user.id,id,JSON.stringify(metrics));});}catch(error){unlinkSync(join(uploads,id+'.glb'));throw error;}
    if(old)try{unlinkSync(join(uploads,old.id+'.glb'));}catch{}res.json({id,url:'/api/vehicle/'+id+'.glb',category:'car',metrics});
  }finally{req.release();}});
  app.get('/api/avatar/:id.glb',async (req,res)=>{if(!(await db.prepare('SELECT 1 FROM avatars WHERE id=?').get(req.params.id)))fail(404,'角色模型不存在');res.type('model/gltf-binary').sendFile(join(uploads,req.params.id+'.glb'));});
  app.put('/api/avatar',...upload,async(req,res)=>{req.validating=true;try{
    const metrics=await validateModel(req.body,{width:2,depth:2},{avatar:true});if(metrics.size[1]<.5||metrics.size[1]>2.4)fail(400,'角色高度须为 0.5～2.4 米，宽深不超过 2 米');
    const id=randomUUID();let old;writeFileSync(join(uploads,id+'.glb'),req.body,{flag:'wx'});
    try{await store.transaction(async()=>{old=await db.prepare('SELECT id FROM avatars WHERE owner=?').get(req.user.id);await db.prepare('INSERT INTO avatars VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET id=excluded.id,metrics=excluded.metrics').run(req.user.id,id,JSON.stringify(metrics));});}catch(e){unlinkSync(join(uploads,id+'.glb'));throw e;}
    if(old)try{unlinkSync(join(uploads,old.id+'.glb'));}catch{}res.json({id,url:'/api/avatar/'+id+'.glb',metrics});
  }finally{req.release();}});
  app.post('/api/cli/plots/upload',...upload,async(req,res)=>{req.validating=true;try{
    const plot=(await store.getPlot(req.user.id));if(!plot)fail(409,'请先在网页领取地皮');const title=typeof req.query.title==='string'?req.query.title.trim():'';if(!title||title.length>60)fail(400,'名称须为 1～60 字');
    const revision=store.plotRevision(req.user.id),metrics=await validateModel(req.body,plot),id=randomUUID();
    if(revision!==store.plotRevision(req.user.id)||!(await store.getPlot(req.user.id)))fail(409,'地皮已删除，请重新上传');
    let written=false;
    try{await store.transaction(async()=>{
      if(revision!==store.plotRevision(req.user.id)||!await store.getPlot(req.user.id))fail(409,'地皮已删除，请重新上传');
      if((await db.prepare('SELECT count(*) n FROM model_drafts WHERE owner=?').get(req.user.id)).n>=20)fail(409,'最多保留 20 份未提交模型');
      writeFileSync(join(uploads,id+'.glb'),req.body,{flag:'wx'});written=true;
      await db.prepare('INSERT INTO model_drafts VALUES (?,?,?,?,?)').run(id,req.user.id,title,JSON.stringify(metrics),Date.now());
    });}catch(error){if(written)unlinkSync(join(uploads,id+'.glb'));throw error;}
    res.status(201).json({id,title,status:'draft',metrics});
  }finally{req.release();}});
  app.post('/api/cli/plots/:id/submit',requireUser,async (req,res)=>{
    (await store.rate('cli-submit:'+req.user.id,20));const result=(await store.transaction(async ()=>{const draft=(await db.prepare('SELECT * FROM model_drafts WHERE id=? AND owner=?').get(req.params.id,req.user.id));if(!draft)fail(404,'未找到自己的待提交模型');(await store.canSubmit(req.user.id));(await db.prepare("INSERT INTO submissions(id,owner,title,status,metrics,created) VALUES (?,?,?,'pending',?,?)").run(draft.id,req.user.id,draft.title,draft.metrics,Date.now()));(await db.prepare('DELETE FROM model_drafts WHERE id=?').run(draft.id));return (await store.getSubmission(draft.id));}));res.status(201).json(result);
  });
}
