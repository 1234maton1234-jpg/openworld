import {requireUser} from './auth.mjs';
import {fail} from './store.mjs';

export function teleportCode(value){if(typeof value!=='string')fail(400,'请输入传送码');const code=value.normalize('NFKC').trim().toLowerCase();if(!/^[a-z0-9_\-\p{Script=Han}]{2,24}$/u.test(code))fail(400,'传送码为 2–24 位中文、字母、数字、下划线或短横线');return code;}
export async function installTeleports(app,store){
  const {db}=store,columns=await db.columns('teleport_codes');
  if(columns.length&&!columns.some(column=>column.name==='plot_x'))await store.transaction(async()=>{await db.exec('CREATE TABLE teleport_codes_multi(plot_x INTEGER NOT NULL,plot_z INTEGER NOT NULL,owner TEXT NOT NULL REFERENCES users(id),code TEXT NOT NULL UNIQUE,enabled INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(plot_x,plot_z),FOREIGN KEY(plot_x,plot_z) REFERENCES plots(x,z) ON DELETE CASCADE); INSERT INTO teleport_codes_multi SELECT p.x,p.z,t.owner,t.code,t.enabled FROM teleport_codes t JOIN plots p ON p.owner=t.owner WHERE NOT EXISTS (SELECT 1 FROM plots p2 WHERE p2.owner=p.owner AND (p2.x<p.x OR (p2.x=p.x AND p2.z<p.z))); DROP TABLE teleport_codes; ALTER TABLE teleport_codes_multi RENAME TO teleport_codes')});
  else await db.exec('CREATE TABLE IF NOT EXISTS teleport_codes(plot_x INTEGER NOT NULL,plot_z INTEGER NOT NULL,owner TEXT NOT NULL REFERENCES users(id),code TEXT NOT NULL UNIQUE,enabled INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(plot_x,plot_z),FOREIGN KEY(plot_x,plot_z) REFERENCES plots(x,z) ON DELETE CASCADE)');
  async function selected(owner,key){if(key)return store.getPlot(owner,key);const plots=await store.getPlots(owner);if(plots.length>1)fail(409,'请先选择要设置的领地');return plots[0];}
  app.get('/api/teleport-settings',requireUser,async(req,res)=>{const plot=await selected(req.user.id,req.query.plot);if(!plot)return res.json({code:'',enabled:false});const row=await db.prepare('SELECT code,enabled FROM teleport_codes WHERE plot_x=? AND plot_z=?').get(plot.x,plot.z);res.json({code:row?.code||'',enabled:!!row?.enabled});});
  app.put('/api/teleport-settings',requireUser,async(req,res)=>{
    if(typeof req.body?.enabled!=='boolean')fail(400,'传送开关无效');
    const code=req.body.code===''&&!req.body.enabled?'':teleportCode(req.body.code);if(code==='spawn')fail(400,'spawn 是系统出生点，不能用作领地传送码');
    try{await store.transaction(async()=>{
      const plot=await selected(req.user.id,req.query.plot);if(!plot)fail(409,'请先领取地皮');
      if(!code){await db.prepare('DELETE FROM teleport_codes WHERE plot_x=? AND plot_z=?').run(plot.x,plot.z);return;}
      const taken=await db.prepare('SELECT plot_x,plot_z FROM teleport_codes WHERE code=?').get(code);if(taken&&(taken.plot_x!==plot.x||taken.plot_z!==plot.z))fail(409,'这个传送码已被其他领地使用');
      await db.prepare('INSERT INTO teleport_codes(plot_x,plot_z,owner,code,enabled) VALUES (?,?,?,?,?) ON CONFLICT(plot_x,plot_z) DO UPDATE SET code=excluded.code,enabled=excluded.enabled').run(plot.x,plot.z,req.user.id,code,Number(req.body.enabled));
    });}catch(error){if(error.code==='23505'||/UNIQUE constraint failed: teleport_codes.code/.test(error.message))fail(409,'这个传送码已被其他领地使用');throw error;}
    res.json({code,enabled:req.body.enabled});
  });
  app.get('/api/teleports/:code',async(req,res)=>{
    const code=teleportCode(req.params.code);if(code==='spawn')return res.json({code,name:'原始出生点',x:0,z:48,yaw:0});
    const row=await db.prepare('SELECT plot_x,plot_z,owner FROM teleport_codes WHERE code=? AND enabled=1').get(code),plot=row&&await store.getPlot(row.owner,row.plot_x+','+row.plot_z);if(!plot)fail(404,'传送码不存在或已关闭');
    const point=plot.entrance?.points?.[1];res.json({code,name:plot.name||'玩家领地',x:point?.[0]??plot.cx,z:point?.[2]??plot.cz,yaw:0});
  });
}
