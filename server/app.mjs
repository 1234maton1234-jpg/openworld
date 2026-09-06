import express from 'express';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createStore,RULES,coordinate,fail} from './store.mjs';
import {installAuth,requireUser,requireAdmin} from './auth.mjs';
import {validateModel} from './validate.mjs';
import {installCliApi} from './cli-api.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export function createApp(config){
  if(config.production&&(!config.url.startsWith('https:')||!config.clientId||!config.clientSecret||!config.adminIds.length))throw new Error('Production requires HTTPS, GitHub OAuth and administrator IDs.');
  config.url=new URL(config.url).origin;
  const data=resolve(config.dataDir),uploads=join(data,'uploads');mkdirSync(uploads,{recursive:true});
  const store=createStore(join(data,'town.sqlite')),app=express();app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});
    if(req.path.startsWith('/api')||req.path.startsWith('/auth')||req.path.startsWith('/assets'))res.set('Cache-Control','no-store');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin!==config.url)fail(403,'请求来源不匹配，请使用网站正式地址');
    next();
  });
  app.use(express.json({limit:'16kb'}));installAuth(app,store,config);
  installCliApi(app,store,uploads);
  app.get('/api/world',(req,res)=>{const x=coordinate(Number(req.query.x??0)),z=coordinate(Number(req.query.z??0)),r=Number(req.query.radius??3);if(!Number.isInteger(r)||r<1||r>4)fail(400,'加载范围无效');res.json({plots:store.world(x,z,r),planning:{...store.planner.around(x,z),lots:[],freeform:true},rules:RULES});});
  app.get('/api/mine',requireUser,(req,res)=>res.json({plot:store.getPlot(req.user.id)||null,submissions:store.db.prepare('SELECT * FROM submissions WHERE owner=? ORDER BY created DESC').all(req.user.id)}));
  app.patch('/api/plots/mine',requireUser,(req,res)=>{
    const {name,description}=req.body||{};if(typeof name!=='string'||!name.trim()||name.trim().length>60||typeof description!=='string'||description.trim().length>1000)fail(400,'名称需为 1–60 字，介绍不超过 1000 字');
    if(!store.getPlot(req.user.id))fail(404,'你尚未领取地皮');
    store.db.prepare('UPDATE plots SET name=?,description=? WHERE owner=?').run(name.trim(),description.trim(),req.user.id);res.json(store.getPlot(req.user.id));
  });
  app.delete('/api/plots/mine',requireUser,(req,res)=>{
    const ids=store.deletePlot(req.user.id);
    for(const id of ids)try{unlinkSync(join(uploads,id+'.glb'));}catch(error){if(error.code!=='ENOENT')console.error('Plot asset cleanup failed:',error.code);}
    res.json({ok:true});
  });
  app.post('/api/plots/check',requireUser,(req,res)=>{store.rate('land-check:'+req.user.id,60);res.json(store.checkLand(req.body?.polygon));});
  app.post('/api/plots/claim',requireUser,(req,res)=>{store.rate('claim:'+req.user.id,10);res.status(201).json(req.body?.polygon?store.claimLand(req.user.id,req.body.polygon):store.claim(req.user.id,req.body?.x,req.body?.z));});
  let validating=0;
  app.post('/api/submissions',requireUser,(req,res,next)=>{
    store.rate('upload:'+req.user.id,8,3600000);store.canSubmit(req.user.id);req.plotRevision=store.plotRevision(req.user.id);
    if(validating>=2)fail(503,'当前有模型正在校验，请稍后提交');validating++;let released=false;
    const release=()=>{if(!released){released=true;validating--;}};res.once('finish',release);res.once('close',()=>{if(!req.validationRunning)release();});req.releaseValidation=release;next();
  },express.raw({type:['model/gltf-binary','application/octet-stream'],limit:RULES.maxBytes,inflate:false}),async(req,res)=>{
    req.validationRunning=true;
    try{
      const title=typeof req.query.title==='string'?req.query.title.trim():'';if(!title||title.length>60)fail(400,'建筑名称需为 1–60 字');
      const metrics=await validateModel(req.body,store.getPlot(req.user.id)),id=randomUUID();if(req.plotRevision!==store.plotRevision(req.user.id))fail(409,'地皮已删除，请重新上传');store.canSubmit(req.user.id);
      writeFileSync(join(uploads,id+'.glb'),req.body,{flag:'wx'});
      try{res.status(201).json(store.submit(req.user.id,title,metrics,id));}catch(error){unlinkSync(join(uploads,id+'.glb'));throw error;}
    }finally{req.releaseValidation();}
  });
  app.get('/api/admin/submissions',requireAdmin,(req,res)=>res.json(store.db.prepare("SELECT s.*,u.login,p.x,p.z FROM submissions s JOIN users u ON s.owner=u.id JOIN plots p ON p.owner=s.owner WHERE s.status='pending' ORDER BY s.created LIMIT 100").all()));
  app.post('/api/admin/submissions/:id/review',requireAdmin,(req,res)=>{
    if(typeof req.body?.approve!=='boolean'||typeof req.body?.note!=='string'||req.body.note.length>500)fail(400,'审核参数无效');
    if(!req.body.approve&&!req.body.note.trim())fail(400,'请填写退回原因');
    res.json(store.review(req.params.id,req.user.id,req.body.approve,req.body.note.trim()));
  });
  app.get('/assets/:id.glb',(req,res)=>{
    const row=store.getSubmission(req.params.id);if(!row)fail(404,'模型不存在');
    const published=store.db.prepare('SELECT 1 FROM plots WHERE published=?').get(row.id);
    if(!published&&req.user?.id!==row.owner&&!req.user?.admin)fail(404,'模型不存在');
    res.type('model/gltf-binary').sendFile(join(uploads,row.id+'.glb'));
  });
  app.get('/health',(req,res)=>res.set('Cache-Control','no-store').json({ok:true,serverTime:Date.now()}));
  app.get('/game',(req,res)=>res.sendFile(join(root,'public','game.html')));
  app.get('/cli-authorize',(req,res)=>res.set('Cache-Control','no-store').sendFile(join(root,'public','cli-authorize.html')));
  app.use(express.static(join(root,'public'),{index:'index.html',maxAge:0}));
  app.use((req,res)=>res.status(404).json({error:'页面不存在'}));
  app.use((error,req,res,next)=>{
    if(res.headersSent)return next(error);
    const status=error.type==='entity.too.large'?413:error.status||500;
    res.status(status).json({error:status===413?'文件超过 12 MB 限制':status<500?error.message:'服务暂时不可用，请稍后重试'});
    if(status>=500)console.error(error.message);
  });
  return {app,store};
}
