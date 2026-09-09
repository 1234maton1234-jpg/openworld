import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {createHash} from 'node:crypto';

export function optimizeModel(bytes){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL(import.meta.url),{workerData:{bytes},resourceLimits:{maxOldGenerationSizeMb:256}});let settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);void worker.terminate();error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(new Error('Model optimization timed out')),60000);
    worker.once('message',result=>result.error?finish(new Error(result.error)):finish(null,result));
    worker.once('error',error=>finish(error));worker.once('exit',()=>finish(new Error('Model optimization worker stopped')));
  });
}

if(!isMainThread){
  try{
    const {NodeIO,Logger}=await import('@gltf-transform/core'),{weld,simplify}=await import('@gltf-transform/functions'),{MeshoptSimplifier}=await import('meshoptimizer'),sharp=(await import('sharp')).default,{validateBytes}=await import('gltf-validator');
    const original=new Uint8Array(workerData.bytes),io=new NodeIO(),variants=[];
    const digest=accessor=>{const array=accessor?.getArray();return array?createHash('sha256').update(new Uint8Array(array.buffer,array.byteOffset,array.byteLength)).digest('hex'):null;};
    function signature(root){return JSON.stringify({nodes:root.listNodes().map(n=>({name:n.getName(),extras:n.getExtras(),translation:n.getTranslation(),rotation:n.getRotation(),scale:n.getScale(),children:n.listChildren().map(c=>root.listNodes().indexOf(c)),skin:root.listSkins().indexOf(n.getSkin())})),skins:root.listSkins().map(s=>({joints:s.listJoints().map(j=>root.listNodes().indexOf(j)),inverseBind:digest(s.getInverseBindMatrices())})),animations:root.listAnimations().map(a=>({name:a.getName(),channels:a.listChannels().map(c=>[root.listNodes().indexOf(c.getTargetNode()),c.getTargetPath()]),samplers:a.listSamplers().map(s=>[s.getInterpolation(),digest(s.getInput()),digest(s.getOutput())])}))});}
    for(const [level,ratio,error,textureSize] of [[0,1,0,2048],[1,.5,.005,1024],[2,.2,.015,512]]){
      const document=await io.readBinary(original),root=document.getRoot(),before=signature(root);document.setLogger(new Logger(Logger.Verbosity.SILENT));
      if(level)await document.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio,error,lockBorder:true}));
      for(const texture of root.listTextures()){
        const input=Buffer.from(texture.getImage()),pipeline=sharp(input,{limitInputPixels:2048*2048}).resize({width:textureSize,height:textureSize,fit:'inside',withoutEnlargement:true});
        const output=texture.getMimeType()==='image/jpeg'?await pipeline.jpeg({quality:level?82:92,mozjpeg:true}).toBuffer():await pipeline.png({compressionLevel:9}).toBuffer();
        const metadata=await sharp(input).metadata();if(output.length<input.length||metadata.width>textureSize||metadata.height>textureSize)texture.setImage(output);
      }
      if(signature(root)!==before)throw new Error('Optimization changed rig or interaction structure');
      const output=await io.writeBinary(document),report=await validateBytes(output,{maxIssues:10});if(report.issues.numErrors)throw new Error('Optimized GLB failed validation');
      let triangles=0;root.listScenes()[0].traverse(n=>{for(const p of n.getMesh()?.listPrimitives()||[])triangles+=(p.getIndices()?.getCount()||p.getAttribute('POSITION').getCount())/3;});
      const data=level===0&&output.length>original.length?original:output;
      variants.push({level,bytes:data,byteLength:data.length,triangles,sha256:createHash('sha256').update(data).digest('hex'),textureSize});
    }
    parentPort.postMessage({version:1,sourceHash:createHash('sha256').update(original).digest('hex'),variants});
  }catch(error){parentPort.postMessage({error:error.message});}
}
