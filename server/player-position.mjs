import {playerPose} from '../shared/player-state.mjs';
import {TERRAIN} from '../shared/terrain.mjs';

export const positionWorld=`${TERRAIN.seed}:${TERRAIN.version}`;
export async function createPlayerPositions(db){
  await db.exec('CREATE TABLE IF NOT EXISTS player_positions(owner TEXT PRIMARY KEY REFERENCES users(id),world TEXT NOT NULL,x REAL NOT NULL,y REAL NOT NULL,z REAL NOT NULL,yaw REAL NOT NULL,updated INTEGER NOT NULL)');
  return {
    async load(owner){const row=await db.prepare('SELECT * FROM player_positions WHERE owner=? AND world=?').get(owner,positionWorld);return row?playerPose({...row,active:true}):null;},
    async save(owner,value){const p=playerPose(value);if(!p?.active)return;await db.prepare('INSERT INTO player_positions(owner,world,x,y,z,yaw,updated) VALUES (?,?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET world=excluded.world,x=excluded.x,y=excluded.y,z=excluded.z,yaw=excluded.yaw,updated=excluded.updated').run(owner,positionWorld,p.x,p.y,p.z,p.yaw,Date.now());}
  };
}
