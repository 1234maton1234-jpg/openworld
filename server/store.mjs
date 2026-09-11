import {createPlanner} from './planner.mjs';
import {openDatabase} from './database.mjs';
import {randomUUID} from 'node:crypto';
import {polygonInfo,plotPolygon,polygonDistance,LAND} from '../shared/polygon-land.mjs';
import {createLandCheck} from '../shared/land-check.mjs';
import {plotTerrain,TERRAIN,PLOT,MAX_COORDINATE} from '../shared/terrain.mjs';
import {MODEL_RESOURCE_RULES} from '../shared/model-resource-rules.mjs';

export const RULES={width:PLOT.width,depth:PLOT.depth,height:PLOT.height,cell:PLOT.cell,...MODEL_RESOURCE_RULES,maxCoordinate:MAX_COORDINATE,maxPlotsPerOwner:1};
export function fail(status,message){throw Object.assign(new Error(message),{status});}
export function coordinate(v){if(!Number.isSafeInteger(v)||Math.abs(v)>RULES.maxCoordinate)fail(400,'地块坐标必须为有效整数');return v;}
function plotCoordinates(key){const match=/^(-?\d+),(-?\d+)$/.exec(String(key||''));if(!match)fail(400,'领地标识无效');return [coordinate(Number(match[1])),coordinate(Number(match[2]))];}
export async function createStore(path){
  const db=await openDatabase(path),transaction=fn=>db.transaction(fn);
  try{return await db.transaction(async()=>{await db.exec(`
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,login TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS plots(x INTEGER NOT NULL,z INTEGER NOT NULL,owner TEXT NOT NULL REFERENCES users(id),published TEXT,PRIMARY KEY(x,z));
    CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','published','rejected','superseded')),metrics TEXT NOT NULL,created INTEGER NOT NULL,reviewer TEXT,reviewed INTEGER,note TEXT NOT NULL DEFAULT '',plot_x INTEGER,plot_z INTEGER);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth(state TEXT PRIMARY KEY,verifier TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS model_drafts(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,metrics TEXT NOT NULL,created INTEGER NOT NULL,plot_x INTEGER,plot_z INTEGER);
    CREATE TABLE IF NOT EXISTS plot_quotas(owner TEXT PRIMARY KEY REFERENCES users(id),max_plots INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS plot_grants(name TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
  `);
  if(!(await db.columns('plots')).some(c=>c.name==='elevation')){(await db.exec('ALTER TABLE plots ADD COLUMN elevation REAL NOT NULL DEFAULT 4.3'));for(const row of (await db.prepare('SELECT x,z FROM plots').all()))(await db.prepare('UPDATE plots SET elevation=? WHERE x=? AND z=?').run(plotTerrain(row.x,row.z).elevation,row.x,row.z));}
  (await db.exec('CREATE TABLE IF NOT EXISTS world_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)'));
  const terrainId=`${TERRAIN.seed}:${TERRAIN.version}`,saved=(await db.prepare("SELECT value FROM world_meta WHERE key='terrain'").get());
  if(saved?.value===`${TERRAIN.seed}:1`&&TERRAIN.version===2){(await transaction(async ()=>{
    for(const row of (await db.prepare('SELECT x,z FROM plots').all()))(await db.prepare('UPDATE plots SET elevation=? WHERE x=? AND z=?').run(Math.max(1.5,plotTerrain(row.x,row.z).elevation),row.x,row.z));
    (await db.prepare("UPDATE world_meta SET value=? WHERE key='terrain'").run(terrainId));
  }));}else if(saved&&saved.value!==terrainId)throw new Error('Terrain version mismatch: migrate existing land before changing the world seed.');
  (await db.prepare("INSERT OR IGNORE INTO world_meta VALUES ('terrain',?)").run(terrainId));
  const layout=(await db.prepare("SELECT value FROM world_meta WHERE key='plot-layout'").get());
  if(layout&&layout.value!==String(PLOT.version))throw new Error('Unknown plot layout version');
  if(!layout)(await transaction(async ()=>{
    for(const row of (await db.prepare('SELECT x,z FROM plots').all())){
      coordinate(row.x);coordinate(row.z);
      (await db.prepare('UPDATE plots SET elevation=? WHERE x=? AND z=?').run(plotTerrain(row.x,row.z).elevation,row.x,row.z));
    }
    (await db.prepare("INSERT INTO world_meta VALUES ('plot-layout',?)").run(String(PLOT.version)));
  }));
  for(const col of ['cx','cz'])if(!(await db.columns('plots')).some(c=>c.name===col))(await db.exec('ALTER TABLE plots ADD COLUMN '+col+' REAL'));
  (await db.exec('UPDATE plots SET cx=x*70 WHERE cx IS NULL; UPDATE plots SET cz=z*70 WHERE cz IS NULL; CREATE INDEX IF NOT EXISTS plot_position ON plots(cx,cz)'));
  const planner=(await createPlanner(db));
  for(const name of ['name','description'])if(!(await db.columns('plots')).some(c=>c.name===name))(await db.exec("ALTER TABLE plots ADD COLUMN "+name+" TEXT NOT NULL DEFAULT ''"));
  for(const [name,type] of [['polygon','TEXT'],['entrance','TEXT'],['width','REAL'],['depth','REAL'],['area','REAL']])if(!(await db.columns('plots')).some(c=>c.name===name))(await db.exec('ALTER TABLE plots ADD COLUMN '+name+' '+type));
  for(const table of ['submissions','model_drafts'])for(const name of ['plot_x','plot_z'])if(!(await db.columns(table)).some(c=>c.name===name))await db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} INTEGER`);
  if(db.postgres){
    await db.exec('ALTER TABLE IF EXISTS teleport_codes DROP CONSTRAINT IF EXISTS teleport_codes_owner_fkey; ALTER TABLE plots DROP CONSTRAINT IF EXISTS plots_owner_key');
  }else{
    const schema=await db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='plots'").get();
    if(/owner\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(schema?.sql||'')){
      const teleports=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='teleport_codes'").get()?await db.prepare('SELECT owner,code,enabled FROM teleport_codes').all():[];
      await db.exec('DROP TABLE IF EXISTS teleport_codes; CREATE TABLE plots_multi(x INTEGER NOT NULL,z INTEGER NOT NULL,owner TEXT NOT NULL REFERENCES users(id),published TEXT,elevation REAL NOT NULL DEFAULT 4.3,cx REAL,cz REAL,name TEXT NOT NULL DEFAULT \'\',description TEXT NOT NULL DEFAULT \'\',polygon TEXT,entrance TEXT,width REAL,depth REAL,area REAL,PRIMARY KEY(x,z)); INSERT INTO plots_multi SELECT x,z,owner,published,elevation,cx,cz,name,description,polygon,entrance,width,depth,area FROM plots; DROP TABLE plots; ALTER TABLE plots_multi RENAME TO plots');
      await db.exec('CREATE TABLE teleport_codes(plot_x INTEGER NOT NULL,plot_z INTEGER NOT NULL,owner TEXT NOT NULL REFERENCES users(id),code TEXT NOT NULL UNIQUE,enabled INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(plot_x,plot_z),FOREIGN KEY(plot_x,plot_z) REFERENCES plots(x,z) ON DELETE CASCADE)');
      for(const row of teleports){const plot=await db.prepare('SELECT x,z FROM plots WHERE owner=? ORDER BY x,z LIMIT 1').get(row.owner);if(plot)await db.prepare('INSERT INTO teleport_codes VALUES (?,?,?,?,?)').run(plot.x,plot.z,row.owner,row.code,row.enabled);}
    }
  }
  await db.exec('CREATE TABLE IF NOT EXISTS plot_quotas(owner TEXT PRIMARY KEY REFERENCES users(id),max_plots INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS plot_grants(name TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id)); DROP INDEX IF EXISTS one_pending');
  await db.exec('UPDATE submissions SET plot_x=(SELECT x FROM plots WHERE plots.owner=submissions.owner ORDER BY x,z LIMIT 1),plot_z=(SELECT z FROM plots WHERE plots.owner=submissions.owner ORDER BY x,z LIMIT 1) WHERE plot_x IS NULL OR plot_z IS NULL; UPDATE model_drafts SET plot_x=(SELECT x FROM plots WHERE plots.owner=model_drafts.owner ORDER BY x,z LIMIT 1),plot_z=(SELECT z FROM plots WHERE plots.owner=model_drafts.owner ORDER BY x,z LIMIT 1) WHERE plot_x IS NULL OR plot_z IS NULL; CREATE INDEX IF NOT EXISTS plot_owner ON plots(owner); CREATE UNIQUE INDEX IF NOT EXISTS one_pending_plot ON submissions(plot_x,plot_z) WHERE status=\'pending\'');
  const decode=row=>row?{...row,key:row.x+','+row.z,polygon:row.polygon?JSON.parse(row.polygon):null,entrance:row.entrance?JSON.parse(row.entrance):null,width:row.width||64,depth:row.depth||64,area:row.area||4096,version:row.polygon?8:4}:row;
  const getUser=async id=>(await db.prepare('SELECT * FROM users WHERE id=?').get(id));
  const revisionKey=(owner,key='')=>owner+':'+key,plotRevisions=new Map(),plotRevision=(owner,key='')=>plotRevisions.get(revisionKey(owner,key))||0;
  const getPlots=async owner=>(await db.prepare('SELECT * FROM plots WHERE owner=? ORDER BY x,z').all(owner)).map(decode);
  const getPlot=async (owner,key)=>{if(!key)return (await getPlots(owner))[0];const [x,z]=plotCoordinates(key);return decode(await db.prepare('SELECT * FROM plots WHERE owner=? AND x=? AND z=?').get(owner,x,z));};
  const getPlotLimit=async owner=>(await db.prepare('SELECT max_plots FROM plot_quotas WHERE owner=?').get(owner))?.max_plots||RULES.maxPlotsPerOwner;
  async function setPlotLimit(owner,max){if(!Number.isSafeInteger(max)||max<1||max>100)fail(400,'领地额度须为 1～100');if(!await getUser(owner))fail(404,'账号不存在');await db.prepare('INSERT INTO plot_quotas(owner,max_plots) VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET max_plots=excluded.max_plots').run(owner,max);return max;}
  async function deletePlot(owner,key){const plot=await getPlot(owner,key),ids=(await transaction(async ()=>{
    if(!plot)fail(404,'你尚未领取这块地皮');
    const rows=(await db.prepare('SELECT id FROM submissions WHERE owner=? AND plot_x=? AND plot_z=? UNION SELECT id FROM model_drafts WHERE owner=? AND plot_x=? AND plot_z=?').all(owner,plot.x,plot.z,owner,plot.x,plot.z));
    (await db.prepare('DELETE FROM plots WHERE owner=? AND x=? AND z=?').run(owner,plot.x,plot.z));
    (await db.prepare('DELETE FROM submissions WHERE owner=? AND plot_x=? AND plot_z=?').run(owner,plot.x,plot.z));
    (await db.prepare('DELETE FROM model_drafts WHERE owner=? AND plot_x=? AND plot_z=?').run(owner,plot.x,plot.z));
    const rk=revisionKey(owner,plot.key);plotRevisions.set(rk,plotRevision(owner,plot.key)+1);plotRevisions.set(revisionKey(owner),plotRevision(owner)+1);
    return rows.map(row=>row.id);
  }));return ids;}
  const getSubmission=async id=>(await db.prepare('SELECT * FROM submissions WHERE id=?').get(id));
  async function upsertUser(id,login){(await db.prepare('INSERT INTO users VALUES (?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login').run(id,login));return (await getUser(id));}
  async function claim(owner,x,z){coordinate(x);coordinate(z);return (await transaction(async ()=>{
    const limit=await getPlotLimit(owner);if((await getPlots(owner)).length>=limit)fail(409,limit===1?'每个账号只能领取一块地皮':'已达到当前账号的领地上限');
    if((await db.prepare('SELECT 1 FROM plots WHERE x=? AND z=?').get(x,z)))fail(409,'这块地已经被领取，请重新选择');
    const terrain=(await planner.lot(x,z));if(!terrain)fail(409,'这里是道路、河道或公共空间，请选择已开放的沿街地块');
    for(const row of (await db.prepare('SELECT * FROM plots').all()).map(decode))if(polygonDistance(plotPolygon(terrain),plotPolygon(row))<LAND.gap)fail(409,'与已有领地或公共间距重叠');
    (await db.prepare('INSERT INTO plots(x,z,owner,elevation,cx,cz) VALUES (?,?,?,?,?,?)').run(x,z,owner,terrain.elevation,terrain.cx,terrain.cz));return (await getPlot(owner,x+','+z));
  }));}
  async function checkLand(polygon){const info=polygonInfo(polygon),x=coordinate(Math.round(info.cx/70)),z=coordinate(Math.round(info.cz/70));return createLandCheck((await planner.around(x,z)),(await db.prepare('SELECT * FROM plots').all()).map(decode))(polygon);}
  async function claimLand(owner,polygon){return (await transaction(async ()=>{const limit=await getPlotLimit(owner);if((await getPlots(owner)).length>=limit)fail(409,limit===1?'每个账号只能领取一块地皮':'已达到当前账号的领地上限');const land=(await checkLand(polygon));let x=Math.round(land.cx/70),z=Math.round(land.cz/70);while((await db.prepare('SELECT 1 FROM plots WHERE x=? AND z=?').get(x,z)))coordinate(++x);(await db.prepare('INSERT INTO plots(x,z,owner,elevation,cx,cz,polygon,entrance,width,depth,area) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(x,z,owner,land.elevation,land.cx,land.cz,JSON.stringify(land.polygon),JSON.stringify(land.entrance),land.width,land.depth,land.area));return (await getPlot(owner,x+','+z));}));}
  async function canSubmit(owner,key){const plot=await getPlot(owner,key);if(!plot)fail(409,'请先领取地块');if((await db.prepare("SELECT 1 FROM submissions WHERE plot_x=? AND plot_z=? AND status='pending'").get(plot.x,plot.z)))fail(409,'这块领地已有建筑等待审核');if((await db.prepare('SELECT count(*) AS n FROM submissions WHERE owner=?').get(owner)).n>=20)fail(409,'已达到首版每人 20 个建筑版本的存储限额');return plot;}
  async function submitToPlot(owner,key,title,metrics,id=randomUUID(),expectedRevision){return (await transaction(async ()=>{if(expectedRevision!==undefined&&expectedRevision!==plotRevision(owner,key))fail(409,'地皮已删除，请重新上传');const plot=await canSubmit(owner,key);await db.prepare("INSERT INTO submissions(id,owner,title,status,metrics,created,plot_x,plot_z) VALUES (?,?,?,'pending',?,?,?,?)").run(id,owner,title,JSON.stringify(metrics),Date.now(),plot.x,plot.z);return (await getSubmission(id));}));}
  async function submit(owner,title,metrics,id=randomUUID(),expectedRevision){const plot=await getPlot(owner);if(!plot)fail(409,'请先领取地块');return submitToPlot(owner,plot.key,title,metrics,id,expectedRevision);}
  async function review(id,reviewer,approve,note=''){return (await transaction(async ()=>{
    const row=(await getSubmission(id));if(!row)fail(404,'未找到提交');if(row.status!=='pending')fail(409,'这份提交已处理，请刷新');
    let replaced=null;if(approve){const plot=await getPlot(row.owner,row.plot_x+','+row.plot_z);if(!plot)fail(409,'领地已删除，无法通过审核');replaced=plot.published;if(replaced)(await db.prepare("UPDATE submissions SET status='superseded' WHERE id=?").run(replaced));(await db.prepare('UPDATE plots SET published=? WHERE owner=? AND x=? AND z=?').run(id,row.owner,row.plot_x,row.plot_z));}
    (await db.prepare('UPDATE submissions SET status=?,reviewer=?,reviewed=?,note=? WHERE id=?').run(approve?'published':'rejected',reviewer,Date.now(),note,id));return {submission:await getSubmission(id),replaced};
  }));}
  const world=async (x,z,r)=>(await db.prepare(`SELECT p.*,u.login,s.title,s.metrics FROM plots p JOIN users u ON p.owner=u.id LEFT JOIN submissions s ON p.published=s.id WHERE p.cx BETWEEN ? AND ? AND p.cz BETWEEN ? AND ?`).all((x-r-8)*70,(x+r+8)*70,(z-r-8)*70,(z+r+8)*70)).map(decode);
  async function rate(key,max,window=60000){const now=Date.now();await db.prepare('DELETE FROM rate_limits WHERE expires<?').run(now);const row=await db.prepare('INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=rate_limits.count+1 RETURNING count').get(key,now+window);if(row.count>max)fail(429,'操作太频繁，请稍后再试');}
  return {db,planner,transaction,getUser,getPlot,getPlots,getPlotLimit,setPlotLimit,deletePlot,plotRevision,getSubmission,upsertUser,claim,claimLand,checkLand,canSubmit,submit,submitToPlot,review,world,rate,close:async ()=>(await db.close())};
  });}catch(error){await db.close();throw error;}
}
