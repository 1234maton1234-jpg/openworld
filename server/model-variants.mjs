import {assetStorage} from './asset-storage.mjs';
import {optimizeModel} from './model-optimizer.mjs';

const jobs=new Map(),failures=new Map(),queue=[];let running=0;
function location(uploads,id){if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw Object.assign(new Error('Invalid asset ID'),{status:400});return assetStorage(uploads).identity+'/derived/'+id;}
function drain(){while(running<2&&queue.length){const job=queue.shift();running++;job.run().then(job.resolve,job.reject).finally(()=>{running--;drain();});}}
export async function modelManifest(uploads,id){try{
  location(uploads,id);const assets=assetStorage(uploads),manifest=JSON.parse((await assets.read(`derived/${id}/manifest.json`)).toString('utf8'));
  if(manifest.version!==1||!Array.isArray(manifest.variants)||manifest.variants.length!==3)return null;
  for(const [level,variant] of manifest.variants.entries())if(variant.level!==level||variant.file!==`lod${level}.glb`||await assets.size(`derived/${id}/${variant.file}`)!==variant.byteLength)return null;
  return manifest;
}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}}
export function ensureModelVariants(uploads,id){
  const directory=location(uploads,id);if(jobs.has(directory))return jobs.get(directory);
  if((failures.get(directory)||0)>Date.now())return Promise.reject(Object.assign(new Error('Asset optimization unavailable; retry later'),{status:503}));
  if(queue.length>=8)return Promise.reject(Object.assign(new Error('Asset optimizer busy'),{status:503}));
  const promise=new Promise((resolve,reject)=>{queue.push({resolve,reject,async run(){
    const existing=await modelManifest(uploads,id);if(existing)return existing;
    const assets=assetStorage(uploads),source=await assets.read(id+'.glb'),result=await optimizeModel(source);
    const variants=[];for(const variant of result.variants){const file=`lod${variant.level}.glb`;await assets.put(`derived/${id}/${file}`,variant.bytes);const {bytes,...metrics}=variant;variants.push({...metrics,file});}
    const manifest={version:result.version,sourceHash:result.sourceHash,sourceBytes:source.length,variants};await assets.put(`derived/${id}/manifest.json`,Buffer.from(JSON.stringify(manifest)));return manifest;
  }});drain();});
  jobs.set(directory,promise);promise.then(()=>{jobs.delete(directory);failures.delete(directory);},()=>{jobs.delete(directory);if(failures.size>=256)failures.delete(failures.keys().next().value);failures.set(directory,Date.now()+60000);});return promise;
}
export async function serveModel(req,res,uploads,id,{publicAsset=false}={}){
  const cache=()=>res.set('Cache-Control',publicAsset?'public, max-age=31536000, immutable':'private, no-store');
  if(req.query.manifest==='1'){
    const manifest=await modelManifest(uploads,id);if(manifest){cache();return res.json({status:'ready',...manifest,variants:manifest.variants.map(({file,...v})=>({...v,url:req.path+'?lod='+v.level}))});}
    if((failures.get(location(uploads,id))||0)>Date.now())return res.set('Cache-Control','no-store').set('Retry-After','60').status(503).json({status:'failed',retryAfter:60,error:'Model optimization unavailable; original model retained'});
    void ensureModelVariants(uploads,id).catch(error=>console.error('Asset optimization failed:',error.message));
    return res.set('Cache-Control','no-store').status(202).json({status:'processing',retryAfter:3});
  }
  const lod=req.query.lod;if(lod!==undefined&&!['0','1','2'].includes(lod))return res.status(400).json({error:'Invalid model LOD'});
  const manifest=lod!==undefined?await modelManifest(uploads,id):null,variant=manifest?.variants.find(v=>v.level===Number(lod));
  if(variant){cache();res.set('X-Model-Variant',String(variant.level));return assetStorage(uploads).serve(req,res,`derived/${id}/${variant.file}`);}
  if(lod===undefined)cache();else res.set('Cache-Control','no-store');
  res.set('X-Model-Variant','original');return assetStorage(uploads).serve(req,res,id+'.glb');
}
export async function removeModel(uploads,id){
  const key=location(uploads,id),assets=assetStorage(uploads);await jobs.get(key)?.catch(()=>{});
  await assets.remove(id+'.glb');for(const file of ['manifest.json','lod0.glb','lod1.glb','lod2.glb'])await assets.remove(`derived/${id}/${file}`);failures.delete(key);
}
