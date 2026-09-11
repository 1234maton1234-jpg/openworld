import express from 'express';
import {serveModel,removeModel} from './model-variants.mjs';
import {assetStorage} from './asset-storage.mjs';
import {randomUUID} from 'node:crypto';
import {requireUser} from './auth.mjs';
import {fail,RULES} from './store.mjs';
import {validateModel} from './validate.mjs';
import {VEHICLE_TYPES,vehicleCategory} from '../shared/vehicle-types.mjs';

export async function installCliApi(app,store,uploads){
  const {db}=store;uploads=assetStorage(uploads);
  (await db.exec('CREATE TABLE IF NOT EXISTS model_drafts(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,metrics TEXT NOT NULL,created INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS avatars(owner TEXT PRIMARY KEY REFERENCES users(id),id TEXT NOT NULL,metrics TEXT NOT NULL)'));
  let busy=0;
  await db.exec('CREATE TABLE IF NOT EXISTS vehicles(owner TEXT PRIMARY KEY REFERENCES users(id),id TEXT NOT NULL,metrics TEXT NOT NULL)');
  await db.exec('CREATE TABLE IF NOT EXISTS extra_vehicles(owner TEXT NOT NULL REFERENCES users(id),category TEXT NOT NULL,id TEXT NOT NULL,metrics TEXT NOT NULL,PRIMARY KEY(owner,category))');
  function category(req){try{return vehicleCategory(req.query.category);}catch(error){fail(400,error.message);}}
  async function getVehicle(owner,type){return type==='car'?db.prepare('SELECT id,metrics FROM vehicles WHERE owner=?').get(owner):db.prepare('SELECT id,metrics FROM extra_vehicles WHERE owner=? AND category=?').get(owner,type);}
  async function selectedPlot(owner,key){if(key)return store.getPlot(owner,key);const plots=await store.getPlots(owner);if(plots.length>1)fail(409,'该账号有多块领地，请使用 --plot X,Z 选择');return plots[0];}
  const upload=[requireUser,async (req,res,next)=>{(await store.rate('cli-upload:'+req.user.id,12,3600000));if(busy>=2)fail(503,'模型校验繁忙');busy++;let done=false;req.release=()=>{if(!done){done=true;busy--;}};res.once('finish',req.release);res.once('close',()=>{if(!req.validating)req.release();});next();},express.raw({type:['model/gltf-binary','application/octet-stream'],limit:RULES.maxBytes,inflate:false})];
  app.get('/api/avatar',async (req,res)=>{const row=req.user&&(await db.prepare('SELECT id FROM avatars WHERE owner=?').get(req.user.id));res.json({url:row?'/api/avatar/'+row.id+'.glb':null});});
  app.get('/api/vehicle',async(req,res)=>{const type=category(req),row=req.user&&await getVehicle(req.user.id,type);res.json({id:row?.id||null,url:row?'/api/vehicle/'+row.id+'.glb':null,category:type});});
  app.get('/api/vehicle/:id.glb',async(req,res)=>{if(!await db.prepare('SELECT 1 FROM vehicles WHERE id=? UNION ALL SELECT 1 FROM extra_vehicles WHERE id=?').get(req.params.id,req.params.id))fail(404,'载具模型不存在');await serveModel(req,res,uploads,req.params.id,{publicAsset:true});});
  app.put('/api/vehicle',...upload,async(req,res)=>{req.validating=true;try{
    const type=category(req),rule=VEHICLE_TYPES[type],metrics=await validateModel(req.body,{width:rule.width,depth:rule.length},{vehicle:type});if(metrics.size[1]<.5||metrics.size[1]>rule.height)fail(400,rule.name+'模型高度须为 0.5～'+rule.height+' 米，宽不超过 '+rule.width+' 米，长不超过 '+rule.length+' 米');
    const id=randomUUID();let old;await uploads.put(id+'.glb',req.body,{exclusive:true});
    try{await store.transaction(async()=>{old=await getVehicle(req.user.id,type);if(type==='car')await db.prepare('INSERT INTO vehicles VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET id=excluded.id,metrics=excluded.metrics').run(req.user.id,id,JSON.stringify(metrics));else await db.prepare('INSERT INTO extra_vehicles VALUES (?,?,?,?) ON CONFLICT(owner,category) DO UPDATE SET id=excluded.id,metrics=excluded.metrics').run(req.user.id,type,id,JSON.stringify(metrics));});}catch(error){await removeModel(uploads,id);throw error;}
    if(old)try{await removeModel(uploads,old.id);}catch{}res.json({id,url:'/api/vehicle/'+id+'.glb',category:type,metrics});
  }finally{req.release();}});
  app.get('/api/avatar/:id.glb',async (req,res)=>{if(!(await db.prepare('SELECT 1 FROM avatars WHERE id=?').get(req.params.id)))fail(404,'角色模型不存在');await serveModel(req,res,uploads,req.params.id,{publicAsset:true});});
  app.put('/api/avatar',...upload,async(req,res)=>{req.validating=true;try{
    const metrics=await validateModel(req.body,{width:2,depth:2},{avatar:true});if(metrics.size[1]<.5||metrics.size[1]>2.4)fail(400,'角色高度须为 0.5～2.4 米，宽深不超过 2 米');
    const id=randomUUID();let old;await uploads.put(id+'.glb',req.body,{exclusive:true});
    try{await store.transaction(async()=>{old=await db.prepare('SELECT id FROM avatars WHERE owner=?').get(req.user.id);await db.prepare('INSERT INTO avatars VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET id=excluded.id,metrics=excluded.metrics').run(req.user.id,id,JSON.stringify(metrics));});}catch(e){await removeModel(uploads,id);throw e;}
    if(old)try{await removeModel(uploads,old.id);}catch{}res.json({id,url:'/api/avatar/'+id+'.glb',metrics});
  }finally{req.release();}});
  app.post('/api/cli/plots/upload',...upload,async(req,res)=>{req.validating=true;try{
    const plot=await selectedPlot(req.user.id,req.query.plot);if(!plot)fail(409,'请先在网页领取地皮');const title=typeof req.query.title==='string'?req.query.title.trim():'';if(!title||title.length>60)fail(400,'名称须为 1～60 字');
    const revision=store.plotRevision(req.user.id,plot.key),metrics=await validateModel(req.body,plot),id=randomUUID();
    if(revision!==store.plotRevision(req.user.id,plot.key)||!(await store.getPlot(req.user.id,plot.key)))fail(409,'地皮已删除，请重新上传');
    let written=false;
    try{await store.transaction(async()=>{
      if(revision!==store.plotRevision(req.user.id,plot.key)||!await store.getPlot(req.user.id,plot.key))fail(409,'地皮已删除，请重新上传');
      if((await db.prepare('SELECT count(*) n FROM model_drafts WHERE owner=?').get(req.user.id)).n>=20)fail(409,'最多保留 20 份未提交模型');
      await uploads.put(id+'.glb',req.body,{exclusive:true});written=true;
      await db.prepare('INSERT INTO model_drafts(id,owner,title,metrics,created,plot_x,plot_z) VALUES (?,?,?,?,?,?,?)').run(id,req.user.id,title,JSON.stringify(metrics),Date.now(),plot.x,plot.z);
    });}catch(error){if(written)await removeModel(uploads,id);throw error;}
    res.status(201).json({id,title,status:'draft',metrics});
  }finally{req.release();}});
  app.post('/api/cli/plots/:id/submit',requireUser,async (req,res)=>{
    (await store.rate('cli-submit:'+req.user.id,20));const result=(await store.transaction(async ()=>{const draft=(await db.prepare('SELECT * FROM model_drafts WHERE id=? AND owner=?').get(req.params.id,req.user.id));if(!draft)fail(404,'未找到自己的待提交模型');const key=draft.plot_x+','+draft.plot_z;(await store.canSubmit(req.user.id,key));(await db.prepare("INSERT INTO submissions(id,owner,title,status,metrics,created,plot_x,plot_z) VALUES (?,?,?,'pending',?,?,?,?)").run(draft.id,req.user.id,draft.title,draft.metrics,Date.now(),draft.plot_x,draft.plot_z));(await db.prepare('DELETE FROM model_drafts WHERE id=?').run(draft.id));return (await store.getSubmission(draft.id));}));res.status(201).json(result);
  });
}
