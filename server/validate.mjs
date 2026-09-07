import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {RULES,fail} from './store.mjs';
import {containsPolygon} from '../shared/polygon-land.mjs';

export async function validateModel(bytes,plot=null,{avatar=false,vehicle=false}={}){
  if(!Buffer.isBuffer(bytes)||bytes.length<28||bytes.length>RULES.maxBytes||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)fail(400,'请上传不超过 12 MB 的有效 GLB 2.0 文件');
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL(import.meta.url),{workerData:{bytes,plot,avatar,vehicle},resourceLimits:{maxOldGenerationSizeMb:128}});
    const timer=setTimeout(()=>{worker.terminate();reject(Object.assign(new Error('模型校验超时，请简化模型'),{status:400}));},12000);
    worker.once('message',result=>{clearTimeout(timer);worker.terminate();result.error?reject(Object.assign(new Error(result.error),{status:400})):resolve(result);});
    worker.once('error',()=>{clearTimeout(timer);reject(Object.assign(new Error('无法解析模型，请重新导出 GLB'),{status:400}));});
    worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Object.assign(new Error('模型校验未完成'),{status:400}));});
  });
}

if(!isMainThread){
  try{
    const {plot,avatar}=workerData,bytes=Buffer.from(workerData.bytes),length=bytes.readUInt32LE(12);
    if(bytes.readUInt32LE(16)!==0x4e4f534a||length>2*1024*1024||20+length>bytes.length)fail(400,'GLB 数据结构无效');
    const json=JSON.parse(bytes.subarray(20,20+length).toString('utf8'));
    if((json.buffers||[]).some(b=>b.uri)||(json.images||[]).some(i=>i.uri))fail(400,'模型和贴图必须全部内嵌，不能引用外部资源');
    if((json.extensionsUsed||[]).length||(json.extensionsRequired||[]).length)fail(400,'首版请导出不含扩展和压缩的标准 GLB，使用普通 PBR 材质');
    if((!avatar&&(json.animations?.length||json.skins?.length))||(json.meshes||[]).some(m=>m.primitives.some(p=>p.targets?.length)))fail(400,'建筑只支持静态模型，角色暂不支持形变');
    if(avatar&&(!json.skins?.length||json.skins.length>4||json.skins.some(s=>s.joints.length>128)||!['idle','walk','run','sit','cycle'].every(name=>json.animations?.some(a=>a.name===name))))fail(400,'角色必须绑骨，最多 128 骨骼，并包含 idle/walk/run/sit/cycle 动作');
    if(json.scenes?.length!==1||(json.nodes||[]).length>RULES.maxNodes)fail(400,'请只导出一个场景，节点不超过 512 个');
    if((json.images||[]).length>RULES.maxTextures||(json.accessors||[]).some(a=>a.count>300000))fail(400,'模型资源超出限制');
    const {validateBytes}=await import('gltf-validator');
    const report=await validateBytes(new Uint8Array(bytes),{maxIssues:20});
    if(report.issues.numErrors)fail(400,'GLB 校验失败：'+report.issues.messages.filter(m=>m.severity===0).slice(0,2).map(m=>m.code).join('、'));
    const {NodeIO,getBounds}=await import('@gltf-transform/core');
    const document=await new NodeIO().readBinary(new Uint8Array(bytes)),root=document.getRoot(),scene=root.listScenes()[0];
    if(avatar){
      scene.traverse(node=>{if(!node.getMesh())return;const skin=node.getSkin();if(!skin)fail(400,'角色所有网格必须绑定骨架');for(const primitive of node.getMesh().listPrimitives()){const weights=primitive.getAttribute('WEIGHTS_0'),joints=primitive.getAttribute('JOINTS_0'),position=primitive.getAttribute('POSITION');if(!weights||!joints||weights.getCount()!==position.getCount()||joints.getCount()!==position.getCount())fail(400,'角色缺少有效蒙皮权重');for(let i=0;i<weights.getCount();i++){const w=weights.getElement(i,[]),j=joints.getElement(i,[]);if(w.some(v=>!Number.isFinite(v)||v<0)||Math.abs(w.reduce((a,b)=>a+b,0)-1)>.01||j.some(v=>!Number.isInteger(v)||v<0||v>=skin.listJoints().length))fail(400,'角色蒙皮权重或骨骼索引无效');}}});
      for(const animation of root.listAnimations()){if(animation.listChannels().length===0||animation.listChannels().length>128)fail(400,'角色动作轨道无效');for(const sampler of animation.listSamplers()){const times=sampler.getInput()?.getArray(),values=sampler.getOutput()?.getArray();if(!times?.length||times.length>10000||!values?.every(Number.isFinite)||!times.every(Number.isFinite)||times.at(-1)<=0||times.at(-1)>60)fail(400,'角色动作时长须在 0～60 秒之间，关键帧不能超过 10000');}}
    }
    let triangles=0,primitives=0;
    scene.traverse(node=>{const mesh=node.getMesh();if(!mesh)return;for(const p of mesh.listPrimitives()){
      if(p.getMode()!==4)fail(400,'请将模型三角化后提交');
      const pos=p.getAttribute('POSITION');if(!pos||pos.getType()!=='VEC3'||!pos.getArray().every(Number.isFinite))fail(400,'顶点坐标无效');
      triangles+=(p.getIndices()?.getCount()??pos.getCount())/3;primitives++;
      if(triangles>RULES.maxTriangles||primitives>RULES.maxPrimitives)fail(400,'建筑需在 10 万三角面、200 个绘制单元以内');
    }});
    const bounds=getBounds(scene),size=bounds.max.map((v,i)=>v-bounds.min[i]);
    if(!triangles||size.some(v=>!Number.isFinite(v))||Math.max(...size)<.01)fail(400,'模型为空或尺寸无效');
    const width=plot?.width||RULES.width,depth=plot?.depth||RULES.depth;
    if(size[0]>width+.001||size[2]>depth+.001||size[1]>RULES.height+.001)fail(400,`建筑尺寸 ${size.map(v=>v.toFixed(2)).join(' × ')} 米，超过宽 ${width} / 高 ${RULES.height} / 深 ${depth} 米限制`);
    if(plot?.polygon){const poly=plot.polygon.map(([x,z])=>[x-plot.cx,z-plot.cz]),cx=(bounds.min[0]+bounds.max[0])/2,cz=(bounds.min[2]+bounds.max[2])/2;
      scene.traverse(node=>{const mesh=node.getMesh();if(!mesh)return;const m=node.getWorldMatrix();for(const primitive of mesh.listPrimitives()){const pos=primitive.getAttribute('POSITION'),indices=primitive.getIndices(),count=indices?.getCount()??pos.getCount();for(let i=0;i<count;i+=3){const triangle=[];for(let j=0;j<3;j++){const [x,y,z]=pos.getElement(indices?indices.getScalar(i+j):i+j,[]);triangle.push([m[0]*x+m[4]*y+m[8]*z+m[12]-cx,m[2]*x+m[6]*y+m[10]*z+m[14]-cz]);}if(!containsPolygon(poly,triangle))fail(400,'建筑超出多边形地皮边界，请按下载的轮廓调整模型');}}});
    }
    if(bounds.min.some(v=>Math.abs(v)>10000)||bounds.max.some(v=>Math.abs(v)>10000))fail(400,'请将建筑原点移到场景中心附近');
    const sharp=(await import('sharp')).default;let pixels=0;
    for(const texture of root.listTextures()){
      if(!['image/png','image/jpeg'].includes(texture.getMimeType()))fail(400,'只支持 PNG / JPEG 贴图');
      const input=Buffer.from(texture.getImage()),metadata=await sharp(input,{limitInputPixels:2048*2048}).metadata();
      if(!metadata.width||!metadata.height||metadata.width>2048||metadata.height>2048||metadata.pages>1)fail(400,'贴图最大 2048×2048，不支持动画贴图');
      pixels+=metadata.width*metadata.height;if(pixels>16*1024*1024)fail(400,'全部贴图总像素需不超过 1600 万');
      await sharp(input,{limitInputPixels:2048*2048}).raw().toBuffer();
    }
    let vehicleSeats;
    if(workerData.vehicle){try{const declarations=(json.nodes||[]).filter(n=>n.extras?.vehicle?.seats!==undefined);if(declarations.length>1)throw new Error('座位配置只能声明一次');const {carSeats}=await import('../shared/car-seats.mjs');vehicleSeats=carSeats(declarations[0]?.extras.vehicle.seats);if(declarations.length&&vehicleSeats.some(p=>Math.abs(p[0])>size[0]/2||Math.abs(p[2])>size[2]/2||p[1]+.3>size[1]))throw new Error('座位超出车身或头部空间不足');}catch(error){fail(400,error.message);}}
    parentPort.postMessage({size,min:bounds.min,max:bounds.max,triangles,primitives,bytes:bytes.length,...(vehicleSeats?{vehicleSeats}:{})});
  }catch(error){parentPort.postMessage({error:error.status?error.message:'GLB 模型或贴图无效，请重新导出'});}
}
