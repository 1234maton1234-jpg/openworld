import {requireUser} from './auth.mjs';
import {fail} from './store.mjs';

export function teleportCode(value){if(typeof value!=='string')fail(400,'请输入传送码');const code=value.normalize('NFKC').trim().toLowerCase();if(!/^[a-z0-9_\-\p{Script=Han}]{2,24}$/u.test(code))fail(400,'传送码为 2–24 位中文、字母、数字、下划线或短横线');return code;}
export async function installTeleports(app,store){
  const {db}=store;await db.exec('CREATE TABLE IF NOT EXISTS teleport_codes(owner TEXT PRIMARY KEY REFERENCES plots(owner) ON DELETE CASCADE,code TEXT NOT NULL UNIQUE,enabled INTEGER NOT NULL DEFAULT 0)');
  app.get('/api/teleport-settings',requireUser,async(req,res)=>{const row=await db.prepare('SELECT code,enabled FROM teleport_codes WHERE owner=?').get(req.user.id);res.json({code:row?.code||'',enabled:!!row?.enabled});});
  app.put('/api/teleport-settings',requireUser,async(req,res)=>{
    if(typeof req.body?.enabled!=='boolean')fail(400,'传送开关无效');
    const code=req.body.code===''&&!req.body.enabled?'':teleportCode(req.body.code);if(code==='spawn')fail(400,'spawn 是系统出生点，不能用作领地传送码');
    try{await store.transaction(async()=>{
      if(!await store.getPlot(req.user.id))fail(409,'请先领取地皮');
      if(!code){await db.prepare('DELETE FROM teleport_codes WHERE owner=?').run(req.user.id);return;}
      const taken=await db.prepare('SELECT owner FROM teleport_codes WHERE code=?').get(code);if(taken&&taken.owner!==req.user.id)fail(409,'这个传送码已被其他领地使用');
      await db.prepare('INSERT INTO teleport_codes(owner,code,enabled) VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET code=excluded.code,enabled=excluded.enabled').run(req.user.id,code,Number(req.body.enabled));
    });}catch(error){if(error.code==='23505'||/UNIQUE constraint failed: teleport_codes.code/.test(error.message))fail(409,'这个传送码已被其他领地使用');throw error;}
    res.json({code,enabled:req.body.enabled});
  });
  app.get('/api/teleports/:code',async(req,res)=>{
    const code=teleportCode(req.params.code);if(code==='spawn')return res.json({code,name:'原始出生点',x:0,z:48,yaw:0});
    const row=await db.prepare('SELECT owner FROM teleport_codes WHERE code=? AND enabled=1').get(code),plot=row&&await store.getPlot(row.owner);if(!plot)fail(404,'传送码不存在或已关闭');
    const point=plot.entrance?.points?.[1];res.json({code,name:plot.name||'玩家领地',x:point?.[0]??plot.cx,z:point?.[2]??plot.cz,yaw:0});
  });
}
