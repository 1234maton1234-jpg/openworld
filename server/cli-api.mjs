import express from 'express';
import {writeFileSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {requireUser} from './auth.mjs';
import {fail,RULES} from './store.mjs';
import {validateModel} from './validate.mjs';

export function installCliApi(app,store,uploads){
  const {db}=store;
  db.exec('CREATE TABLE IF NOT EXISTS model_drafts(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,metrics TEXT NOT NULL,created INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS avatars(owner TEXT PRIMARY KEY REFERENCES users(id),id TEXT NOT NULL,metrics TEXT NOT NULL)');
  let busy=0;
  const upload=[requireUser,(req,res,next)=>{store.rate('cli-upload:'+req.user.id,12,3600000);if(busy>=2)fail(503,'模型校验繁忙');busy++;let done=false;req.release=()=>{if(!done){done=true;busy--;}};res.once('finish',req.release);res.once('close',()=>{if(!req.validating)req.release();});next();},express.raw({type:['model/gltf-binary','application/octet-stream'],limit:RULES.maxBytes,inflate:false})];
  app.get('/api/avatar',(req,res)=>{const row=req.user&&db.prepare('SELECT id FROM avatars WHERE owner=?').get(req.user.id);res.json({url:row?'/api/avatar/'+row.id+'.glb':null});});
  app.get('/api/avatar/:id.glb',(req,res)=>{if(!db.prepare('SELECT 1 FROM avatars WHERE id=?').get(req.params.id))fail(404,'角色模型不存在');res.type('model/gltf-binary').sendFile(join(uploads,req.params.id+'.glb'));});
  app.put('/api/avatar',...upload,async(req,res)=>{req.validating=true;try{
    const metrics=await validateModel(req.body,{width:2,depth:2});if(metrics.size[1]<.5||metrics.size[1]>2.4)fail(400,'角色高度须为 0.5～2.4 米，宽深不超过 2 米');
    const id=randomUUID(),old=db.prepare('SELECT id FROM avatars WHERE owner=?').get(req.user.id);writeFileSync(join(uploads,id+'.glb'),req.body,{flag:'wx'});
    try{db.prepare('INSERT INTO avatars VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET id=excluded.id,metrics=excluded.metrics').run(req.user.id,id,JSON.stringify(metrics));}catch(e){unlinkSync(join(uploads,id+'.glb'));throw e;}
    if(old)try{unlinkSync(join(uploads,old.id+'.glb'));}catch{}res.json({id,url:'/api/avatar/'+id+'.glb',metrics});
  }finally{req.release();}});
  app.post('/api/cli/plots/upload',...upload,async(req,res)=>{req.validating=true;try{
    const plot=store.getPlot(req.user.id);if(!plot)fail(409,'请先在网页领取地皮');const title=typeof req.query.title==='string'?req.query.title.trim():'';if(!title||title.length>60)fail(400,'名称须为 1～60 字');
    const metrics=await validateModel(req.body,plot),id=randomUUID();
    store.transaction(()=>{if(db.prepare('SELECT count(*) n FROM model_drafts WHERE owner=?').get(req.user.id).n>=20)fail(409,'最多保留 20 份未提交模型');writeFileSync(join(uploads,id+'.glb'),req.body,{flag:'wx'});try{db.prepare('INSERT INTO model_drafts VALUES (?,?,?,?,?)').run(id,req.user.id,title,JSON.stringify(metrics),Date.now());}catch(e){unlinkSync(join(uploads,id+'.glb'));throw e;}});
    res.status(201).json({id,title,status:'draft',metrics});
  }finally{req.release();}});
  app.post('/api/cli/plots/:id/submit',requireUser,(req,res)=>{
    store.rate('cli-submit:'+req.user.id,20);const result=store.transaction(()=>{const draft=db.prepare('SELECT * FROM model_drafts WHERE id=? AND owner=?').get(req.params.id,req.user.id);if(!draft)fail(404,'未找到自己的待提交模型');store.canSubmit(req.user.id);db.prepare("INSERT INTO submissions(id,owner,title,status,metrics,created) VALUES (?,?,?,'pending',?,?)").run(draft.id,req.user.id,draft.title,draft.metrics,Date.now());db.prepare('DELETE FROM model_drafts WHERE id=?').run(draft.id);return store.getSubmission(draft.id);});res.status(201).json(result);
  });
}
