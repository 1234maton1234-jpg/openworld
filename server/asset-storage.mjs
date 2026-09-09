import {readFile,writeFile,mkdir,rename,unlink,stat} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {S3Client,GetObjectCommand,PutObjectCommand,HeadObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';

export function assetKey(key){if(!/^(?:[a-zA-Z0-9_-]{1,80}\.glb|derived\/[a-zA-Z0-9_-]{1,80}\/(?:lod[012]\.glb|manifest\.json))$/.test(key))throw Object.assign(new Error('Invalid asset key'),{status:400});return key;}
const missing=error=>error.code==='ENOENT'||error.name==='NoSuchKey'||error.name==='NotFound'||error.$metadata?.httpStatusCode===404;
const contentType=key=>key.endsWith('.json')?'application/json':'model/gltf-binary';
export function localAssetStorage(directory){
  directory=resolve(directory);const path=key=>join(directory,assetKey(key));
  return {identity:directory,kind:'local',async read(key){return readFile(path(key));},async size(key){return (await stat(path(key))).size;},async put(key,bytes,{exclusive=false}={}){
    const target=path(key);await mkdir(dirname(target),{recursive:true});if(exclusive)return writeFile(target,bytes,{flag:'wx'});
    const temporary=target+'.'+randomUUID()+'.tmp';try{await writeFile(temporary,bytes,{flag:'wx'});await rename(temporary,target);}finally{await unlink(temporary).catch(error=>{if(!missing(error))throw error;});}
  },async remove(key){await unlink(path(key)).catch(error=>{if(!missing(error))throw error;});},async serve(req,res,key){return res.type(contentType(key)).sendFile(path(key));}};
}
export function r2AssetStorage({endpoint,bucket,accessKeyId,secretAccessKey,prefix='models/',client}){
  const url=new URL(endpoint);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Invalid R2 endpoint');
  if(typeof bucket!=='string'||!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(bucket)||typeof prefix!=='string'||!/^([a-zA-Z0-9_-]+\/)*$/.test(prefix))throw new Error('Invalid R2 bucket or prefix');
  if(!client&&(!accessKeyId||!secretAccessKey))throw new Error('R2 credentials are required');
  client??=new S3Client({region:'auto',endpoint:url.origin,forcePathStyle:true,credentials:{accessKeyId,secretAccessKey},maxAttempts:3});
  const params=key=>({Bucket:bucket,Key:prefix+assetKey(key)}),send=(command,signal=AbortSignal.timeout(30000))=>client.send(command,{abortSignal:signal}).catch(error=>{if(missing(error))throw Object.assign(new Error('Asset not found'),{code:'ENOENT',status:404});throw error;});
  const read=async(key)=>{const result=await send(new GetObjectCommand(params(key)));if(result.ContentLength>24*1024*1024){result.Body?.destroy?.();throw new Error('Stored asset exceeds size limit');}const chunks=[];let size=0;for await(const chunk of result.Body){size+=chunk.length;if(size>24*1024*1024){result.Body.destroy?.();throw new Error('Stored asset exceeds size limit');}chunks.push(chunk);}return Buffer.concat(chunks);};
  return {identity:`r2:${url.origin}/${bucket}/${prefix}`,kind:'r2',read,async size(key){return (await send(new HeadObjectCommand(params(key)))).ContentLength;},async put(key,bytes,{exclusive=false}={}){await send(new PutObjectCommand({...params(key),Body:bytes,ContentType:contentType(key),...(exclusive?{IfNoneMatch:'*'}:{})}));},async remove(key){await send(new DeleteObjectCommand(params(key))).catch(error=>{if(!missing(error))throw error;});},async serve(req,res,key){const bytes=await read(key);return res.type(contentType(key)).send(bytes);}};
}
export const assetStorage=value=>typeof value==='string'?localAssetStorage(value):value;
export function storageConfig(env=process.env){
  const backend=env.ASSET_STORAGE||'local';if(!['local','r2'].includes(backend))throw new Error('ASSET_STORAGE must be local or r2');
  if(backend==='local')return null;
  if(!env.R2_ENDPOINT&&!/^[a-f0-9]{32}$/.test(env.R2_ACCOUNT_ID||''))throw new Error('R2_ENDPOINT or R2_ACCOUNT_ID is required');
  return {endpoint:env.R2_ENDPOINT||`https://${env.R2_ACCOUNT_ID||''}.r2.cloudflarestorage.com`,bucket:env.R2_BUCKET,accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY,prefix:env.R2_PREFIX||'models/'};
}
