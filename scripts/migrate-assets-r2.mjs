import {readdir,readFile} from 'node:fs/promises';
import {resolve,join,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {assetKey,r2AssetStorage,storageConfig} from '../server/asset-storage.mjs';

export async function migrateAssets(directory,target,{execute=false,onProgress=()=>{}}={}){
  directory=resolve(directory);const files=[];
  async function scan(path){for(const entry of await readdir(path,{withFileTypes:true})){const file=join(path,entry.name);if(entry.isDirectory())await scan(file);else if(entry.isFile()){const key=relative(directory,file).split(sep).join('/');try{assetKey(key);files.push({file,key});}catch{}}}}
  await scan(directory);files.sort((a,b)=>Number(a.key.endsWith('manifest.json'))-Number(b.key.endsWith('manifest.json'))||a.key.localeCompare(b.key));
  let copied=0,existing=0;const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  for(const {file,key} of files){if(!execute){onProgress({key,status:'planned'});continue;}const source=await readFile(file);let prior;
    try{prior=await target.read(key);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(prior){if(hash(prior)!==hash(source))throw new Error('R2 object differs; refusing overwrite: '+key);existing++;}else{await target.put(key,source,{exclusive:true});if(hash(await target.read(key))!==hash(source))throw new Error('R2 verification failed: '+key);copied++;}onProgress({key,status:prior?'verified-existing':'copied-verified'});
  }
  return {planned:files.length,copied,existing,sourcePreserved:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),sourceIndex=args.indexOf('--source'),directory=sourceIndex>=0?args[sourceIndex+1]:join(process.env.DATA_DIR||'data','uploads'),execute=args.includes('--execute');if(!directory)throw new Error('--source requires a directory');
  const target=execute?r2AssetStorage(storageConfig({...process.env,ASSET_STORAGE:'r2'})):null;
  console.log(JSON.stringify(await migrateAssets(directory,target,{execute,onProgress:row=>console.log(JSON.stringify(row))})));
}
