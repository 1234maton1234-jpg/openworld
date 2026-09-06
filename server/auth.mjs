import {randomBytes,createHash} from 'node:crypto';
import {fail} from './store.mjs';
const random=()=>randomBytes(32).toString('base64url');
const hash=s=>createHash('sha256').update(s).digest('hex');
function cookie(req,key){return (req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(key+'='))?.slice(key.length+1)||'';}
export function installAuth(app,store,config){
  const {db}=store,secure=config.url.startsWith('https:'),cookieOptions={httpOnly:true,sameSite:'lax',secure,path:'/'};
  const isAdmin=id=>config.adminIds.includes(id)||(config.demo&&id==='demo-owner');
  function session(req,res,user){const token=random(),csrf=random();db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hash(token),user.id,csrf,Date.now()+7*86400000);res.cookie('town_session',token,{...cookieOptions,maxAge:7*86400000});return {user:{...user,admin:isAdmin(user.id)},csrf};}
  app.use((req,res,next)=>{
    const token=cookie(req,'town_session');const row=token&&db.prepare('SELECT s.csrf,u.* FROM sessions s JOIN users u ON s.user=u.id WHERE s.hash=? AND s.expires>?').get(hash(token),Date.now());
    if(row){req.user={id:row.id,login:row.login,admin:isAdmin(row.id)};req.csrf=row.csrf;}
    next();
  });
  app.get('/api/session',(req,res)=>res.json({user:req.user||null,csrf:req.csrf||null,demo:config.demo,githubReady:!!(config.clientId&&config.clientSecret)}));
  app.post('/api/logout',requireUser,(req,res)=>{db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(cookie(req,'town_session')));res.clearCookie('town_session',cookieOptions);res.json({ok:true});});
  if(config.demo)app.post('/api/demo-login',(req,res)=>{
    if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||req.headers.origin!==config.url)fail(403,'演示登录仅限本机');
    const visitor=req.query.role==='visitor';res.json(session(req,res,store.upsertUser(visitor?'demo-visitor':'demo-owner',visitor?'demo-visitor':'demo-builder')));
  });
  app.get('/auth/github',(req,res)=>{
    if(!config.clientId||!config.clientSecret)return res.redirect('/game?auth=not-configured');
    store.rate('oauth:'+req.socket.remoteAddress,20);
    const state=random(),verifier=random();db.prepare('DELETE FROM oauth WHERE expires<?').run(Date.now());db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO oauth VALUES (?,?,?)').run(hash(state),verifier,Date.now()+600000);
    res.cookie('town_oauth',state,{...cookieOptions,maxAge:600000});
    const params=new URLSearchParams({client_id:config.clientId,redirect_uri:config.url+'/auth/github/callback',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
    res.redirect('https://github.com/login/oauth/authorize?'+params);
  });
  app.get('/auth/github/callback',async(req,res)=>{
    const state=typeof req.query.state==='string'?req.query.state:'';
    if(!state||state!==cookie(req,'town_oauth'))return res.redirect('/game?auth=state');
    const row=db.prepare('DELETE FROM oauth WHERE state=? RETURNING *').get(hash(state));res.clearCookie('town_oauth',cookieOptions);
    if(!row||row.expires<Date.now()||typeof req.query.code!=='string')return res.redirect('/game?auth=expired');
    try{
      const response=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,code:req.query.code,redirect_uri:config.url+'/auth/github/callback',code_verifier:row.verifier}),signal:AbortSignal.timeout(15000)});
      const token=await response.json();if(!response.ok||!token.access_token)throw new Error('token');
      const profile=await fetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+token.access_token,Accept:'application/vnd.github+json','User-Agent':'sakurami-online','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});
      const user=await profile.json();if(!profile.ok||!Number.isSafeInteger(user.id)||user.id<=0||typeof user.login!=='string')throw new Error('profile');
      session(req,res,store.upsertUser(String(user.id),user.login));res.redirect('/game');
    }catch{res.redirect('/game?auth=failed');}
  });
}
export function requireUser(req,res,next){if(!req.user)fail(401,'请先使用 GitHub 登录');if(!['GET','HEAD'].includes(req.method)&&(!req.csrf||req.headers['x-csrf-token']!==req.csrf))fail(403,'会话校验失败，请刷新页面');next();}
export function requireAdmin(req,res,next){requireUser(req,res,()=>{if(!req.user.admin)fail(403,'仅管理员可审核');next();});}
