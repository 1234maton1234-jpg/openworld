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
export async function createStore(path){
  const db=await openDatabase(path),transaction=fn=>db.transaction(fn);
  try{return await db.transaction(async()=>{await db.exec(`
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,login TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS plots(x INTEGER NOT NULL,z INTEGER NOT NULL,owner TEXT NOT NULL UNIQUE REFERENCES users(id),published TEXT,PRIMARY KEY(x,z));
    CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','published','rejected','superseded')),metrics TEXT NOT NULL,created INTEGER NOT NULL,reviewer TEXT,reviewed INTEGER,note TEXT NOT NULL DEFAULT '');
    CREATE UNIQUE INDEX IF NOT EXISTS one_pending ON submissions(owner) WHERE status='pending';
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth(state TEXT PRIMARY KEY,verifier TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS model_drafts(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,metrics TEXT NOT NULL,created INTEGER NOT NULL);
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
  const decode=row=>row?{...row,key:row.x+','+row.z,polygon:row.polygon?JSON.parse(row.polygon):null,entrance:row.entrance?JSON.parse(row.entrance):null,width:row.width||64,depth:row.depth||64,area:row.area||4096,version:row.polygon?8:4}:row;
  const getUser=async id=>(await db.prepare('SELECT * FROM users WHERE id=?').get(id));
  const plotRevisions=new Map(),plotRevision=owner=>plotRevisions.get(owner)||0;
  const getPlots=async owner=>(await db.prepare('SELECT * FROM plots WHERE owner=? ORDER BY x,z').all(owner)).map(decode);
  const getPlot=async owner=>(await getPlots(owner))[0];
  async function deletePlot(owner){const ids=(await transaction(async ()=>{
    if(!(await getPlot(owner)))fail(404,'你尚未领取地皮');
    const rows=(await db.prepare('SELECT id FROM submissions WHERE owner=? UNION SELECT id FROM model_drafts WHERE owner=?').all(owner,owner));
    (await db.prepare('DELETE FROM plots WHERE owner=?').run(owner));
    (await db.prepare('DELETE FROM submissions WHERE owner=?').run(owner));
    (await db.prepare('DELETE FROM model_drafts WHERE owner=?').run(owner));
    plotRevisions.set(owner,plotRevision(owner)+1);
    return rows.map(row=>row.id);
  }));return ids;}
  const getSubmission=async id=>(await db.prepare('SELECT * FROM submissions WHERE id=?').get(id));
  async function upsertUser(id,login){(await db.prepare('INSERT INTO users VALUES (?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login').run(id,login));return (await getUser(id));}
  async function claim(owner,x,z){coordinate(x);coordinate(z);return (await transaction(async ()=>{
    if((await getPlots(owner)).length>=RULES.maxPlotsPerOwner)fail(409,'每个账号只能领取一块地皮');
    if((await db.prepare('SELECT 1 FROM plots WHERE x=? AND z=?').get(x,z)))fail(409,'这块地已经被领取，请重新选择');
    const terrain=(await planner.lot(x,z));if(!terrain)fail(409,'这里是道路、河道或公共空间，请选择已开放的沿街地块');
    for(const row of (await db.prepare('SELECT * FROM plots').all()).map(decode))if(polygonDistance(plotPolygon(terrain),plotPolygon(row))<LAND.gap)fail(409,'与已有领地或公共间距重叠');
    (await db.prepare('INSERT INTO plots(x,z,owner,elevation,cx,cz) VALUES (?,?,?,?,?,?)').run(x,z,owner,terrain.elevation,terrain.cx,terrain.cz));return (await getPlot(owner));
  }));}
  async function checkLand(polygon){const info=polygonInfo(polygon),x=coordinate(Math.round(info.cx/70)),z=coordinate(Math.round(info.cz/70));return createLandCheck((await planner.around(x,z)),(await db.prepare('SELECT * FROM plots').all()).map(decode))(polygon);}
  async function claimLand(owner,polygon){return (await transaction(async ()=>{if((await getPlots(owner)).length>=RULES.maxPlotsPerOwner)fail(409,'每个账号只能领取一块地皮');const land=(await checkLand(polygon));let x=Math.round(land.cx/70),z=Math.round(land.cz/70);while((await db.prepare('SELECT 1 FROM plots WHERE x=? AND z=?').get(x,z)))coordinate(++x);(await db.prepare('INSERT INTO plots(x,z,owner,elevation,cx,cz,polygon,entrance,width,depth,area) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(x,z,owner,land.elevation,land.cx,land.cz,JSON.stringify(land.polygon),JSON.stringify(land.entrance),land.width,land.depth,land.area));return (await getPlot(owner));}));}
  async function canSubmit(owner){if(!(await getPlot(owner)))fail(409,'请先领取地块');if((await db.prepare("SELECT 1 FROM submissions WHERE owner=? AND status='pending'").get(owner)))fail(409,'已有建筑等待审核');if((await db.prepare('SELECT count(*) AS n FROM submissions WHERE owner=?').get(owner)).n>=20)fail(409,'已达到首版每人 20 个建筑版本的存储限额');}
  async function submit(owner,title,metrics,id=randomUUID(),expectedRevision){return (await transaction(async ()=>{if(expectedRevision!==undefined&&expectedRevision!==plotRevision(owner))fail(409,'地皮已删除，请重新上传');(await canSubmit(owner));(await db.prepare("INSERT INTO submissions(id,owner,title,status,metrics,created) VALUES (?,?,?,'pending',?,?)").run(id,owner,title,JSON.stringify(metrics),Date.now()));return (await getSubmission(id));}));}
  async function review(id,reviewer,approve,note=''){return (await transaction(async ()=>{
    const row=(await getSubmission(id));if(!row)fail(404,'未找到提交');if(row.status!=='pending')fail(409,'这份提交已处理，请刷新');
    let replaced=null;if(approve){replaced=(await getPlot(row.owner)).published;if(replaced)(await db.prepare("UPDATE submissions SET status='superseded' WHERE id=?").run(replaced));(await db.prepare('UPDATE plots SET published=? WHERE owner=?').run(id,row.owner));}
    (await db.prepare('UPDATE submissions SET status=?,reviewer=?,reviewed=?,note=? WHERE id=?').run(approve?'published':'rejected',reviewer,Date.now(),note,id));return {submission:await getSubmission(id),replaced};
  }));}
  const world=async (x,z,r)=>(await db.prepare(`SELECT p.*,u.login,s.title,s.metrics FROM plots p JOIN users u ON p.owner=u.id LEFT JOIN submissions s ON p.published=s.id WHERE p.cx BETWEEN ? AND ? AND p.cz BETWEEN ? AND ?`).all((x-r-8)*70,(x+r+8)*70,(z-r-8)*70,(z+r+8)*70)).map(decode);
  async function rate(key,max,window=60000){const now=Date.now();await db.prepare('DELETE FROM rate_limits WHERE expires<?').run(now);const row=await db.prepare('INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=rate_limits.count+1 RETURNING count').get(key,now+window);if(row.count>max)fail(429,'操作太频繁，请稍后再试');}
  return {db,planner,transaction,getUser,getPlot,getPlots,deletePlot,plotRevision,getSubmission,upsertUser,claim,claimLand,checkLand,canSubmit,submit,review,world,rate,close:async ()=>(await db.close())};
  });}catch(error){await db.close();throw error;}
}
