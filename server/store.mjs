import {createPlanner} from './planner.mjs';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {polygonInfo,plotPolygon,polygonDistance,LAND} from '../shared/polygon-land.mjs';
import {createLandCheck} from '../shared/land-check.mjs';
import {plotTerrain,TERRAIN,PLOT,MAX_COORDINATE} from '../shared/terrain.mjs';

export const RULES={width:PLOT.width,depth:PLOT.depth,height:PLOT.height,cell:PLOT.cell,maxBytes:12*1024*1024,maxTriangles:100000,maxNodes:512,maxPrimitives:200,maxTextures:16,maxTextureSize:2048,maxCoordinate:MAX_COORDINATE};
export function fail(status,message){throw Object.assign(new Error(message),{status});}
export function coordinate(v){if(!Number.isSafeInteger(v)||Math.abs(v)>RULES.maxCoordinate)fail(400,'地块坐标必须为有效整数');return v;}
export function createStore(path){
  const db=new DatabaseSync(path);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,login TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS plots(x INTEGER NOT NULL,z INTEGER NOT NULL,owner TEXT NOT NULL UNIQUE REFERENCES users(id),published TEXT,PRIMARY KEY(x,z));
    CREATE TABLE IF NOT EXISTS submissions(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','published','rejected','superseded')),metrics TEXT NOT NULL,created INTEGER NOT NULL,reviewer TEXT,reviewed INTEGER,note TEXT NOT NULL DEFAULT '');
    CREATE UNIQUE INDEX IF NOT EXISTS one_pending ON submissions(owner) WHERE status='pending';
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth(state TEXT PRIMARY KEY,verifier TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
  `);
  if(!db.prepare('PRAGMA table_info(plots)').all().some(c=>c.name==='elevation')){db.exec('ALTER TABLE plots ADD COLUMN elevation REAL NOT NULL DEFAULT 4.3');for(const row of db.prepare('SELECT x,z FROM plots').all())db.prepare('UPDATE plots SET elevation=? WHERE x=? AND z=?').run(plotTerrain(row.x,row.z).elevation,row.x,row.z);}
  db.exec('CREATE TABLE IF NOT EXISTS world_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)');
  const terrainId=`${TERRAIN.seed}:${TERRAIN.version}`,saved=db.prepare("SELECT value FROM world_meta WHERE key='terrain'").get();
  if(saved?.value===`${TERRAIN.seed}:1`&&TERRAIN.version===2){transaction(()=>{
    for(const row of db.prepare('SELECT x,z FROM plots').all())db.prepare('UPDATE plots SET elevation=? WHERE x=? AND z=?').run(Math.max(1.5,plotTerrain(row.x,row.z).elevation),row.x,row.z);
    db.prepare("UPDATE world_meta SET value=? WHERE key='terrain'").run(terrainId);
  });}else if(saved&&saved.value!==terrainId)throw new Error('Terrain version mismatch: migrate existing land before changing the world seed.');
  db.prepare("INSERT OR IGNORE INTO world_meta VALUES ('terrain',?)").run(terrainId);
  const layout=db.prepare("SELECT value FROM world_meta WHERE key='plot-layout'").get();
  if(layout&&layout.value!==String(PLOT.version))throw new Error('Unknown plot layout version');
  if(!layout)transaction(()=>{
    for(const row of db.prepare('SELECT x,z FROM plots').all()){
      coordinate(row.x);coordinate(row.z);
      db.prepare('UPDATE plots SET elevation=? WHERE x=? AND z=?').run(plotTerrain(row.x,row.z).elevation,row.x,row.z);
    }
    db.prepare("INSERT INTO world_meta VALUES ('plot-layout',?)").run(String(PLOT.version));
  });
  for(const col of ['cx','cz'])if(!db.prepare('PRAGMA table_info(plots)').all().some(c=>c.name===col))db.exec('ALTER TABLE plots ADD COLUMN '+col+' REAL');
  db.exec('UPDATE plots SET cx=x*70 WHERE cx IS NULL; UPDATE plots SET cz=z*70 WHERE cz IS NULL; CREATE INDEX IF NOT EXISTS plot_position ON plots(cx,cz)');
  const planner=createPlanner(db);
  for(const [name,type] of [['polygon','TEXT'],['entrance','TEXT'],['width','REAL'],['depth','REAL'],['area','REAL']])if(!db.prepare('PRAGMA table_info(plots)').all().some(c=>c.name===name))db.exec('ALTER TABLE plots ADD COLUMN '+name+' '+type);
  const decode=row=>row?{...row,polygon:row.polygon?JSON.parse(row.polygon):null,entrance:row.entrance?JSON.parse(row.entrance):null,width:row.width||64,depth:row.depth||64,area:row.area||4096,version:row.polygon?8:4}:row;
  function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
  const getUser=id=>db.prepare('SELECT * FROM users WHERE id=?').get(id);
  const getPlot=owner=>decode(db.prepare('SELECT * FROM plots WHERE owner=?').get(owner));
  const getSubmission=id=>db.prepare('SELECT * FROM submissions WHERE id=?').get(id);
  function upsertUser(id,login){db.prepare('INSERT INTO users VALUES (?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login').run(id,login);return getUser(id);}
  function claim(owner,x,z){coordinate(x);coordinate(z);return transaction(()=>{
    if(getPlot(owner))fail(409,'每个账号只能领取一块地皮');
    if(db.prepare('SELECT 1 FROM plots WHERE x=? AND z=?').get(x,z))fail(409,'这块地已经被领取，请重新选择');
    const terrain=planner.lot(x,z);if(!terrain)fail(409,'这里是道路、河道或公共空间，请选择已开放的沿街地块');
    for(const row of db.prepare('SELECT * FROM plots').all().map(decode))if(polygonDistance(plotPolygon(terrain),plotPolygon(row))<LAND.gap)fail(409,'与已有领地或公共间距重叠');
    db.prepare('INSERT INTO plots(x,z,owner,elevation,cx,cz) VALUES (?,?,?,?,?,?)').run(x,z,owner,terrain.elevation,terrain.cx,terrain.cz);return getPlot(owner);
  });}
  function checkLand(polygon){const info=polygonInfo(polygon),x=coordinate(Math.round(info.cx/70)),z=coordinate(Math.round(info.cz/70));return createLandCheck(planner.around(x,z),db.prepare('SELECT * FROM plots').all().map(decode))(polygon);}
  function claimLand(owner,polygon){return transaction(()=>{if(getPlot(owner))fail(409,'每个账号只能领取一块地皮');const land=checkLand(polygon);let x=Math.round(land.cx/70),z=Math.round(land.cz/70);while(db.prepare('SELECT 1 FROM plots WHERE x=? AND z=?').get(x,z))coordinate(++x);db.prepare('INSERT INTO plots(x,z,owner,elevation,cx,cz,polygon,entrance,width,depth,area) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(x,z,owner,land.elevation,land.cx,land.cz,JSON.stringify(land.polygon),JSON.stringify(land.entrance),land.width,land.depth,land.area);return getPlot(owner);});}
  function canSubmit(owner){if(!getPlot(owner))fail(409,'请先领取地块');if(db.prepare("SELECT 1 FROM submissions WHERE owner=? AND status='pending'").get(owner))fail(409,'已有建筑等待审核');if(db.prepare('SELECT count(*) AS n FROM submissions WHERE owner=?').get(owner).n>=20)fail(409,'已达到首版每人 20 个建筑版本的存储限额');}
  function submit(owner,title,metrics,id=randomUUID()){return transaction(()=>{canSubmit(owner);db.prepare("INSERT INTO submissions(id,owner,title,status,metrics,created) VALUES (?,?,?,'pending',?,?)").run(id,owner,title,JSON.stringify(metrics),Date.now());return getSubmission(id);});}
  function review(id,reviewer,approve,note=''){return transaction(()=>{
    const row=getSubmission(id);if(!row)fail(404,'未找到提交');if(row.status!=='pending')fail(409,'这份提交已处理，请刷新');
    if(approve){const old=getPlot(row.owner).published;if(old)db.prepare("UPDATE submissions SET status='superseded' WHERE id=?").run(old);db.prepare('UPDATE plots SET published=? WHERE owner=?').run(id,row.owner);}
    db.prepare('UPDATE submissions SET status=?,reviewer=?,reviewed=?,note=? WHERE id=?').run(approve?'published':'rejected',reviewer,Date.now(),note,id);return getSubmission(id);
  });}
  const world=(x,z,r)=>db.prepare(`SELECT p.*,u.login,s.title,s.metrics FROM plots p JOIN users u ON p.owner=u.id LEFT JOIN submissions s ON p.published=s.id WHERE p.cx BETWEEN ? AND ? AND p.cz BETWEEN ? AND ?`).all((x-r-8)*70,(x+r+8)*70,(z-r-8)*70,(z+r+8)*70).map(decode);
  function rate(key,max,window=60000){const now=Date.now();db.prepare('DELETE FROM rate_limits WHERE expires<?').run(now);db.prepare('INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now+window);if(db.prepare('SELECT count FROM rate_limits WHERE key=?').get(key).count>max)fail(429,'操作太频繁，请稍后再试');}
  return {db,planner,transaction,getUser,getPlot,getSubmission,upsertUser,claim,claimLand,checkLand,canSubmit,submit,review,world,rate,close:()=>db.close()};
}
