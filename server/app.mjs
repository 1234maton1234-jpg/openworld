import express from 'express';
import {installTeleports} from './teleports.mjs';
import {mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createStore,RULES,coordinate,fail} from './store.mjs';
import {installAuth,requireUser,requireAdmin} from './auth.mjs';
import {validateModel} from './validate.mjs';
import {installCliApi} from './cli-api.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function createApp(config){
  if(config.production&&(!config.url.startsWith('https:')||!config.clientId||!config.clientSecret||!config.adminIds.length))throw new Error('Production requires HTTPS, GitHub OAuth and administrator IDs.');
  if(config.production&&!/^postgres(?:ql)?:\/\//.test(config.databaseUrl||''))throw new Error('Production requires a PostgreSQL DATABASE_URL.');
  config.url=new URL(config.url).origin;
  const data=resolve(config.dataDir),uploads=join(data,'uploads');mkdirSync(uploads,{recursive:true});
  const store=(await createStore(config.databaseUrl||join(data,'town.sqlite'))),app=express();app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});
    if(req.path.startsWith('/api')||req.path.startsWith('/auth')||req.path.startsWith('/assets'))res.set('Cache-Control','no-store');
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.headers.origin!==config.url)fail(403,'请求来源不匹配，请使用网站正式地址');
    next();
  });
  app.use(express.json({limit:'16kb'}));
  try{await installAuth(app,store,config);await installCliApi(app,store,uploads);await installTeleports(app,store);}catch(error){await store.close();throw error;}
  app.get('/api/world',async (req,res)=>{const x=coordinate(Number(req.query.x??0)),z=coordinate(Number(req.query.z??0)),r=Number(req.query.radius??3);if(!Number.isInteger(r)||r<1||r>4)fail(400,'加载范围无效');res.json({plots:(await store.world(x,z,r)),planning:{...(await store.planner.around(x,z)),lots:[],freeform:true},rules:RULES});});
  app.get('/api/mine',requireUser,async (req,res)=>res.json({plot:(await store.getPlot(req.user.id))||null,submissions:(await store.db.prepare('SELECT * FROM submissions WHERE owner=? ORDER BY created DESC').all(req.user.id))}));
  app.patch('/api/plots/mine',requireUser,async (req,res)=>{
    const {name,description}=req.body||{};if(typeof name!=='string'||!name.trim()||name.trim().length>60||typeof description!=='string'||description.trim().length>1000)fail(400,'名称需为 1–60 字，介绍不超过 1000 字');
    if(!(await store.getPlot(req.user.id)))fail(404,'你尚未领取地皮');
    (await store.db.prepare('UPDATE plots SET name=?,description=? WHERE owner=?').run(name.trim(),description.trim(),req.user.id));res.json((await store.getPlot(req.user.id)));
  });
  app.delete('/api/plots/mine',requireUser,async (req,res)=>{
    const ids=(await store.deletePlot(req.user.id));
    for(const id of ids)try{unlinkSync(join(uploads,id+'.glb'));}catch(error){if(error.code!=='ENOENT')console.error('Plot asset cleanup failed:',error.code);}
    res.json({ok:true});
  });
  app.post('/api/plots/check',requireUser,async (req,res)=>{(await store.rate('land-check:'+req.user.id,60));res.json((await store.checkLand(req.body?.polygon)));});
  app.post('/api/plots/claim',requireUser,async (req,res)=>{(await store.rate('claim:'+req.user.id,10));res.status(201).json(req.body?.polygon?(await store.claimLand(req.user.id,req.body.polygon)):(await store.claim(req.user.id,req.body?.x,req.body?.z)));});
  let validating=0;
  app.post('/api/submissions',requireUser,async (req,res,next)=>{
    (await store.rate('upload:'+req.user.id,8,3600000));(await store.canSubmit(req.user.id));req.plotRevision=store.plotRevision(req.user.id);
    if(validating>=2)fail(503,'当前有模型正在校验，请稍后提交');validating++;let released=false;
    const release=()=>{if(!released){released=true;validating--;}};res.once('finish',release);res.once('close',()=>{if(!req.validationRunning)release();});req.releaseValidation=release;next();
  },express.raw({type:['model/gltf-binary','application/octet-stream'],limit:RULES.maxBytes,inflate:false}),async(req,res)=>{
    req.validationRunning=true;
    try{
      const title=typeof req.query.title==='string'?req.query.title.trim():'';if(!title||title.length>60)fail(400,'建筑名称需为 1–60 字');
      const metrics=await validateModel(req.body,(await store.getPlot(req.user.id))),id=randomUUID();if(req.plotRevision!==store.plotRevision(req.user.id))fail(409,'地皮已删除，请重新上传');(await store.canSubmit(req.user.id));
      writeFileSync(join(uploads,id+'.glb'),req.body,{flag:'wx'});
      try{res.status(201).json((await store.submit(req.user.id,title,metrics,id,req.plotRevision)));}catch(error){unlinkSync(join(uploads,id+'.glb'));throw error;}
    }finally{req.releaseValidation();}
  });
  app.get('/api/admin/submissions',requireAdmin,async (req,res)=>{
    const status=req.query.status||'pending',offset=Number(req.query.offset||0);
    if(!['pending','published','rejected','superseded'].includes(status)||!Number.isSafeInteger(offset)||offset<0)fail(400,'审核筛选参数无效');
    res.json(await store.db.prepare('SELECT s.*,u.login,p.x,p.z,p.name AS plot_name,p.description AS plot_description FROM submissions s JOIN users u ON s.owner=u.id JOIN plots p ON p.owner=s.owner WHERE s.status=? ORDER BY s.created DESC,s.id LIMIT 100 OFFSET ?').all(status,offset));
  });
  app.post('/api/admin/submissions/:id/review',requireAdmin,async (req,res)=>{
    if(typeof req.body?.approve!=='boolean'||typeof req.body?.note!=='string'||req.body.note.length>500)fail(400,'审核参数无效');
    if(!req.body.approve&&!req.body.note.trim())fail(400,'请填写退回原因');
    res.json((await store.review(req.params.id,req.user.id,req.body.approve,req.body.note.trim())));
  });
  app.get('/assets/:id.glb',async (req,res)=>{
    const row=(await store.getSubmission(req.params.id));if(!row)fail(404,'模型不存在');
    const published=(await store.db.prepare('SELECT 1 FROM plots WHERE published=?').get(row.id));
    if(!published&&req.user?.id!==row.owner&&!req.user?.admin)fail(404,'模型不存在');
    res.type('model/gltf-binary').sendFile(join(uploads,row.id+'.glb'));
  });
  app.get('/health',async(req,res)=>{await store.db.prepare('SELECT 1').get();return res.set('Cache-Control','no-store').json({ok:true,serverTime:Date.now()});});
  app.get(['/admin','/admin.html'],(req,res,next)=>{res.set('Cache-Control','no-store');if(!req.user)return res.redirect('/auth/github?returnTo=admin');requireAdmin(req,res,next);},(req,res)=>res.sendFile(join(root,'public','admin.html')));
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
