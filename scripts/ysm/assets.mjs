import {readFile,stat,realpath} from 'node:fs/promises';
import {resolve,sep,basename} from 'node:path';
import sharp from 'sharp';
import {decodeYsm} from './reader.mjs';
import {readGeometry,readAnimations,animationSupported} from './geometry.mjs';

async function png(bytes,raw){const image=sharp(bytes,raw?{raw,limitInputPixels:4096*4096}:{limitInputPixels:4096*4096});const data=await image.png().toBuffer();return 'data:image/png;base64,'+data.toString('base64');}
function describe(model){
  model.warnings??=[];
  const supported=model.animations.filter(animationSupported).length;
  if(supported!==model.animations.length)model.warnings.push(`${model.animations.length-supported} 个动作含表达式、无限时长或不支持的数据，暂不能播放。`);
  model.warnings.push('试验预览：未实现 Molang、动画控制器、特效、声音和 Minecraft 专属逻辑。');
  return model;
}
export async function loadYsm(bytes,name='YSM'){
  const raw=await decodeYsm(bytes),entity=raw.mainEntity,textures=[];
  for(const [name,t] of Object.entries(entity.textures||{})){
    if(textures.length>=16)throw Error('Preview limit: 16 textures');
    if(t.width<1||t.height<1||t.width>4096||t.height>4096)throw Error('Invalid texture dimensions');
    const data=Buffer.from(t.data,'base64');
    textures.push({name,url:await png(data,t.imageFormat===-1?{width:t.width,height:t.height,channels:4}:null)});
  }
  return describe({name:raw.metadata?.name||name,kind:`YSM · format ${raw.formatVersion} / crypto 3`,geometry:entity.mainModel,textures,defaultTexture:raw.properties?.defaultTexture,animations:Object.values(entity.animationFiles||{}).flatMap(f=>Object.values(f.animations||{}))});
}
export async function loadSource(input,modelName){
  const info=await stat(input);
  if(info.isFile()){if(info.size>12*1024*1024)throw Error('YSM file exceeds 12 MB');return {models:[await loadYsm(await readFile(input),basename(input))]};}
  const root=await realpath(input);
  async function asset(path){const p=await realpath(resolve(root,path));if(!p.startsWith(root+sep))throw Error('Asset path leaves the supplied directory');const s=await stat(p);if(s.size>12*1024*1024)throw Error('Asset exceeds 12 MB');return readFile(p);}
  const manifest=JSON.parse(await asset('geckolib/maid_model.json'));
  const entries=manifest.model_list.filter(m=>m.is_gecko&&(!modelName||m.model_id.split(':')[1]===modelName));
  if(!entries.length)throw Error('No matching GeckoLib model');
  const models=[];
  for(const entry of entries){
    const [namespace,name]=entry.model_id.split(':');if(!/^[\w-]+$/.test(namespace)||!/^[\w-]+$/.test(name))throw Error('Unsupported model identifier');
    const geometry=readGeometry(JSON.parse(await asset(`${namespace}/models/entity/${name}.json`))),animations=[],textures=[];
    const refs=[`${namespace}:textures/entity/${name}.png`,...(entry.extra_textures||[])];
    for(const ref of refs){textures.push({name:ref.split('/').at(-1),url:await png(await asset(ref.replace(':','/')))});}
    for(const ref of entry.animation||[])animations.push(...readAnimations(JSON.parse(await asset(ref.replace(':','/')))));
    models.push(describe({name,kind:'GeckoLib 源资源（非 .ysm 文件）',geometry,textures,animations}));
  }
  return {models};
}
