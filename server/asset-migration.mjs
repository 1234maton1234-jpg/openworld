import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {migrateAssets} from '../scripts/migrate-assets-r2.mjs';

export async function migrateAssetsOnStart(dataDir,target){
  const id=createHash('sha256').update(target.identity).digest('hex').slice(0,24),marker=join(dataDir,`.r2-migrated-${id}.json`);
  try{return {...JSON.parse(await readFile(marker,'utf8')),alreadyCompleted:true};}catch(error){if(error.code!=='ENOENT')throw error;}
  const directory=join(dataDir,'uploads');await mkdir(directory,{recursive:true});
  const result=await migrateAssets(directory,target,{execute:true});
  await writeFile(marker+'.tmp',JSON.stringify(result));await rename(marker+'.tmp',marker);
  return result;
}
