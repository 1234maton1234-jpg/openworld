async function readBytes(response,limit){
  if(Number(response.headers?.get('content-length'))>limit){await response.body?.cancel();throw new Error('Model download exceeds resource limit');}
  if(!response.body?.getReader){const value=await response.arrayBuffer();if(value.byteLength>limit)throw new Error('Model download exceeds resource limit');return value;}
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new Error('Model download exceeds resource limit');}chunks.push(value);}}finally{reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}return result.buffer;
}
export function createModelCache({fetcher=(...args)=>fetch(...args),maxBytes=48*1024*1024,concurrency=2,maxQueued=64,maxDownloadBytes=24*1024*1024}={}){
  const cache=new Map(),pending=new Map(),queue=[];let bytes=0,active=0;
  function drain(){while(active<concurrency&&queue.length){const task=queue.shift();active++;task().finally(()=>{active--;drain();});}}
  function subscribe(task,signal){
    if(!signal){task.persistent=true;return task.promise;}
    task.users++;
    return new Promise((resolve,reject)=>{
      let done=false;
      const finish=(error,value)=>{if(done)return;done=true;signal.removeEventListener('abort',abort);task.users--;error?reject(error):resolve(value);};
      const abort=()=>{finish(signal.reason||new DOMException('Model loading cancelled','AbortError'));if(!task.users&&!task.persistent)task.controller.abort();};
      signal.addEventListener('abort',abort,{once:true});task.promise.then(value=>finish(null,value),error=>finish(error));
      if(signal.aborted)abort();
    });
  }
  function get(url,{signal}={}){
    if(signal?.aborted)return Promise.reject(signal.reason||new DOMException('Model loading cancelled','AbortError'));
    if(cache.has(url)){const value=cache.get(url);cache.delete(url);cache.set(url,value);return Promise.resolve(value);}
    const existing=pending.get(url);if(existing&&!existing.controller.signal.aborted)return subscribe(existing,signal);if(queue.length>=maxQueued)return Promise.reject(new Error('Model loading queue full'));
    const task={controller:new AbortController(),users:0,persistent:false};
    task.promise=new Promise((resolve,reject)=>{queue.push(async()=>{
      const controller=task.controller,timeout=setTimeout(()=>controller.abort(),20000);
      try{controller.signal.throwIfAborted();const response=await fetcher(url,{signal:controller.signal,credentials:'same-origin'});if(!response.ok)throw new Error('Model download failed');const value=await readBytes(response,maxDownloadBytes);controller.signal.throwIfAborted();
        if(value.byteLength<=maxBytes){while(bytes+value.byteLength>maxBytes&&cache.size){const key=cache.keys().next().value;bytes-=cache.get(key).byteLength;cache.delete(key);}cache.set(url,value);bytes+=value.byteLength;}resolve(value);
      }catch(error){reject(error);}finally{clearTimeout(timeout);if(pending.get(url)===task)pending.delete(url);}
    });});pending.set(url,task);const result=subscribe(task,signal);drain();return result;
  }
  return {get,clear(){cache.clear();bytes=0;},get stats(){return {bytes,entries:cache.size,active,queued:queue.length};}};
}
const cache=createModelCache();
export const modelBytes=(url,options)=>cache.get(url,options);
let loadedHook=()=>{};
export const setModelLoadedHook=hook=>{loadedHook=hook;};
export const loadModelAsset=async(loader,url,{track=true,signal,priority=0}={})=>{
  const bytes=await modelBytes(url,{signal});signal?.throwIfAborted();const gltf=await loader.parseAsync(bytes,'');
  if(signal?.aborted){const resources=new Set();gltf.scene.traverse(node=>{if(node.geometry)resources.add(node.geometry);if(node.skeleton)resources.add(node.skeleton);for(const material of node.material?(Array.isArray(node.material)?node.material:[node.material]):[]){resources.add(material);for(const value of Object.values(material))if(value?.isTexture)resources.add(value);}});for(const resource of resources)resource.dispose();signal.throwIfAborted();}
  gltf.scene.userData.modelPriority=priority;if(track)loadedHook(gltf,url);return gltf;
};
