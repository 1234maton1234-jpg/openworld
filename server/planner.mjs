import {CITY,validateRegion,regionAt} from '../shared/city-plan.mjs';
import {archRoad} from '../shared/bridge-arch.mjs';
import {PLOT} from '../shared/terrain.mjs';
import {generateUrbanRegion} from '../shared/urban-plan.mjs';
import {createUrbanTerrain} from '../shared/urban-terrain.mjs';
import {createBridgePlanner} from '../shared/bridge-plan.mjs';
import {generateNaturalRegion} from '../shared/natural-plan.mjs';
import {createWorldHydrology} from '../shared/coastal-hydrology.mjs';
import {retainStreet} from '../shared/street-layout.mjs';
export function createPlanner(db){
  db.exec('CREATE TABLE IF NOT EXISTS city_regions(x INTEGER NOT NULL,z INTEGER NOT NULL,version INTEGER NOT NULL,plan TEXT NOT NULL,PRIMARY KEY(x,z)); CREATE TABLE IF NOT EXISTS city_legacy(x INTEGER NOT NULL,z INTEGER NOT NULL,cx REAL NOT NULL,cz REAL NOT NULL,elevation REAL NOT NULL,PRIMARY KEY(x,z))');
  const saved=db.prepare("SELECT value FROM world_meta WHERE key='city-terrain'").get();
  if(saved&&saved.value!==String(CITY.terrainVersion))throw new Error('City terrain version mismatch: explicit migration required');
  if(!saved){db.exec('BEGIN IMMEDIATE');try{db.exec('INSERT OR IGNORE INTO city_legacy SELECT x,z,x*70,z*70,elevation FROM plots');db.prepare("INSERT INTO world_meta VALUES ('city-terrain',?)").run(String(CITY.terrainVersion));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
  const legacy=db.prepare('SELECT * FROM city_legacy').all().map(p=>({...p,width:PLOT.width,depth:PLOT.depth,legacy:true}));
  let waterConfig=db.prepare("SELECT value FROM world_meta WHERE key='hydrology-v2'").get();
  if(!waterConfig){const frozen=db.prepare('SELECT plan FROM city_regions').all().map(r=>JSON.parse(r.plan).bounds);db.prepare("INSERT INTO world_meta VALUES ('hydrology-v2',?)").run(JSON.stringify(frozen));waterConfig={value:JSON.stringify(frozen)};}
  const frozen=JSON.parse(waterConfig.value);
  let coastalConfig=db.prepare("SELECT value FROM world_meta WHERE key='coastal-hydrology-v3'").get();
  if(!coastalConfig){const value=JSON.stringify({version:3,frozen:db.prepare('SELECT plan FROM city_regions').all().map(r=>JSON.parse(r.plan).bounds),previous:{version:2,frozen}});db.prepare("INSERT INTO world_meta VALUES ('coastal-hydrology-v3',?)").run(value);coastalConfig={value};}
  const water=JSON.parse(coastalConfig.value),hydrology=createWorldHydrology(water);
  let terrainConfig=db.prepare("SELECT value FROM world_meta WHERE key='urban-terrain-v2'").get();
  if(!terrainConfig){const bounds=db.prepare('SELECT plan FROM city_regions').all().map(r=>JSON.parse(r.plan).bounds);const value=JSON.stringify(bounds);db.prepare("INSERT INTO world_meta VALUES ('urban-terrain-v2',?)").run(value);terrainConfig={value};}
  let reliefConfig=db.prepare("SELECT value FROM world_meta WHERE key='regional-relief-v3'").get();
  if(!reliefConfig){const bounds=db.prepare('SELECT plan FROM city_regions').all().map(r=>{const p=JSON.parse(r.plan),points=p.roads.flatMap(r=>r.points);return [Math.min(p.bounds[0],...points.map(v=>v[0])),Math.min(p.bounds[1],...points.map(v=>v[2])),Math.max(p.bounds[2],...points.map(v=>v[0])),Math.max(p.bounds[3],...points.map(v=>v[2]))];}),value=JSON.stringify(bounds);db.prepare("INSERT INTO world_meta VALUES ('regional-relief-v3',?)").run(value);reliefConfig={value};}
  const terrain={version:4,frozen:JSON.parse(terrainConfig.value),reliefFrozen:JSON.parse(reliefConfig.value)},field=createUrbanTerrain(terrain.frozen,hydrology,terrain);
  let bridgeConfig=db.prepare("SELECT value FROM world_meta WHERE key='street-plan-v7'").get();
  if(!bridgeConfig){const old=db.prepare('SELECT plan FROM city_regions').all().map(r=>JSON.parse(r.plan)),value=JSON.stringify({roads:[...new Map(old.flatMap(p=>p.roads).map(r=>[r.id,r])).values()],lots:old.flatMap(p=>p.lots)});db.prepare("INSERT INTO world_meta VALUES ('street-plan-v7',?)").run(value);bridgeConfig={value};}
  const compatibility=JSON.parse(bridgeConfig.value),bridgePlanner=createBridgePlanner(hydrology,field,{roads:compatibility.roads,lots:[...legacy,...compatibility.lots]}),roadRegions=new Map();
  const savedStreets=new Set(compatibility.roads.map(r=>r.id));
  function roads(x,z){const key=x+','+z;if(roadRegions.has(key))return roadRegions.get(key);const values=generateNaturalRegion(x,z,legacy,hydrology).roads.filter(r=>retainStreet(r.id,savedStreets)&&[r.points[0],r.points.at(-1)].every(p=>hydrology.coastDistance(p[0],p[2])>-160)).map(bridgePlanner.route);if(roadRegions.size>256)roadRegions.clear();roadRegions.set(key,values);return values;}
  function region(x,z){const saved=db.prepare('SELECT plan FROM city_regions WHERE x=? AND z=?').get(x,z);if(saved)return JSON.parse(saved.plan);
    const obstacles=[];for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)obstacles.push(...roads(x+dx,z+dz));
    const plan=generateUrbanRegion(x,z,[...legacy,...compatibility.lots],hydrology,field,{version:7,roads:roads(x,z),obstacles}),errors=validateRegion(plan);if(errors.length)throw new Error('Invalid city plan: '+errors.join(','));
    db.prepare('INSERT OR IGNORE INTO city_regions VALUES (?,?,?,?)').run(x,z,plan.version,JSON.stringify(plan));return JSON.parse(db.prepare('SELECT plan FROM city_regions WHERE x=? AND z=?').get(x,z).plan);
  }
  function around(x,z){const center=regionAt(x*PLOT.cell,z*PLOT.cell),regions=[];for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)regions.push(region(center.x+dx,center.z+dz));
    const corridors=[];for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)corridors.push(...roads(center.x+dx,center.z+dz));
    return {terrain,hydrology:water,regions,lots:regions.flatMap(r=>r.lots),roads:[...new Map([...corridors,...regions.flatMap(r=>r.roads)].map(r=>[r.id,r])).values()].map(archRoad),parks:regions.flatMap(r=>r.parks),legacy:legacy.filter(p=>Math.abs(p.cx-x*70)<1500&&Math.abs(p.cz-z*70)<1500)};
  }
  function lot(x,z){return region(Math.floor(x/8),Math.floor(z/8)).lots.find(p=>p.x===x&&p.z===z);}
  return {around,lot,region,legacy};
}
