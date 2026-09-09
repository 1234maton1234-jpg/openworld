import * as T from 'three';
import {loadModelAsset} from './model-cache.mjs';
import {buildModel} from '../scripts/ysm/geometry.mjs';

export function createNativeAvatarRuntime(data,material){
  const rig=buildModel(data.geometry,material);let phase=0,alive=true;
  const pose=(boneName,x=0,y=0,z=0)=>({boneName,rotation:[{timestamp:0,postData:[x,y,z]}]});
  const runtime={scene:rig.root,rig,update({moving=false,running=false,seated=false,climbing=false,vehicleType,crankPhase=0,dt=0}={}){
    if(!alive)return;phase+=Math.max(0,Math.min(dt,.1))*(moving?(running?12:8):2);
    const tracks=[];
    for(const [side,offset] of [['Right',0],['Left',Math.PI]]){
      const swing=moving?Math.sin(phase+offset)*(running?40:25):0;
      let hip=swing,knee=moving?Math.max(0,-Math.sin(phase+offset))*25:0,arm=-swing*.7,elbow=running?-35:-8;
      if(vehicleType==='bike'){hip=-55+Math.sin(crankPhase+offset)*30;knee=65+Math.cos(crankPhase+offset)*25;arm=-65;elbow=-30;}
      else if(seated){hip=-85;knee=85;arm=-25;elbow=-35;}
      else if(climbing){hip=-40+Math.sin(phase+offset)*15;knee=60;arm=-140+Math.sin(phase+offset)*20;elbow=-25;}
      tracks.push(pose(side+'Leg',hip),pose(side+'LowerLeg',knee),pose(side+'Arm',arm),pose(side+'ForeArm',elbow));
    }
    tracks.push(pose('UpBody',vehicleType==='bike'?25:Math.sin(phase)*.6));
    rig.update({length:1,loopMode:1,boneAnimations:tracks},0);
  },dispose(){alive=false;}};
  runtime.update();return runtime;
}
export async function loadAvatar(loader,url,options){
  if(!url.startsWith('/api/development-avatar.json'))return loadModelAsset(loader,url,options);
  const response=await fetch(url);if(!response.ok)throw Error('Development avatar load failed');const data=await response.json();
  if(data.format!=='ysm'||!data.texture?.startsWith('data:image/png;base64,'))throw Error('Invalid native avatar');
  const texture=await new T.TextureLoader().loadAsync(data.texture);texture.colorSpace=T.SRGBColorSpace;texture.flipY=false;texture.magFilter=T.NearestFilter;texture.minFilter=T.NearestFilter;
  const material=new T.MeshStandardMaterial({map:texture,roughness:1,side:T.DoubleSide,alphaTest:.1});
  try{const runtime=createNativeAvatarRuntime(data,material);return {scene:runtime.scene,animations:[],runtime,name:data.name};}catch(error){texture.dispose();material.dispose();throw error;}
}
