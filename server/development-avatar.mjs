import {createHash} from 'node:crypto';
import {MeshBasicMaterial,Box3,Vector3} from 'three';
import {buildModel} from '../scripts/ysm/geometry.mjs';

export function prepareDevelopmentAvatar(model,hide=[]){
  const source=model.geometry.bones,byName=new Map(source.map(b=>[b.name,b]));
  for(const name of hide)if(!byName.has(name))throw Error('Unknown hidden avatar bone: '+name);
  const hidden=new Set(hide),bones=source.filter(b=>{let current=b;const seen=new Set();while(current){if(hidden.has(current.name))return false;if(seen.has(current.name))throw Error('Cyclic avatar hierarchy');seen.add(current.name);current=byName.get(current.parentName);}return true;});
  const geometry={...model.geometry,bones},material=new MeshBasicMaterial();let rig;
  try{rig=buildModel(geometry,material);const size=new Box3().setFromObject(rig.root).getSize(new Vector3());if(!rig.triangles||!size.toArray().every(Number.isFinite)||size.y<.1||size.y>10)throw Error('Invalid development avatar dimensions');}
  finally{rig?.dispose();material.dispose();}
  const texture=model.textures.find(t=>t.name===model.defaultTexture)||model.textures[0];if(!texture)throw Error('Development avatar has no texture');
  return {format:'ysm',name:model.name,geometry,texture:texture.url,motion:'procedural'};
}
export async function installDevelopmentAvatar(app,config){
  if(!config.devAvatarFile)return;
  if(config.production)throw Error('Avatar override is only available in local development');
  const loopback=new Set(['127.0.0.1','localhost','[::1]','::1']);
  if(!loopback.has(new URL(config.url).hostname)||!loopback.has(config.host||'127.0.0.1')||config.databaseUrl)throw Error('Avatar override requires a loopback server and local database');
  const {loadSource}=await import('../scripts/ysm/assets.mjs');
  const {models:[source]}=await loadSource(config.devAvatarFile),avatar=prepareDevelopmentAvatar(source,config.devAvatarHide||[]);
  const version=createHash('sha256').update(JSON.stringify(avatar)).digest('hex').slice(0,16),url='/api/development-avatar.json?v='+version;
  app.get('/api/avatar',(req,res)=>res.json({url,development:true}));
  app.get('/api/development-avatar.json',(req,res)=>res.json(avatar));
}
