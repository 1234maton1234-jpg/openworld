import {Quaternion,Vector3} from 'three';
const axis=new Vector3(1,0,0);
export function createClimbingPose(model){
  const bones=[];model.traverse(bone=>{if(!bone.isBone)return;const name=bone.name.toLowerCase().replace(/[^a-z]/g,'');let kind;if(/(forearm|lowerarm)$/.test(name))kind='elbow';else if(/(arm|upperarm)$/.test(name))kind='arm';else if(/(lowerleg|leg)$/.test(name)&&!/(upleg|rightleg|leftleg)$/.test(name))kind='knee';else if(/(upleg|rightleg|leftleg|thigh)$/.test(name))kind='hip';if(kind)bones.push({bone,kind,offset:name.includes('left')?Math.PI:0,rest:bone.quaternion.clone()});});
  let active=false,phase=0;const q=new Quaternion();
  return {reset(){if(active)for(const {bone,rest} of bones)bone.quaternion.copy(rest);active=false;},update(dt,moving){active=true;if(moving)phase+=Math.max(0,Math.min(dt,.1))*5;for(const {bone,kind,offset,rest} of bones){const swing=Math.sin(phase+offset);const angle=kind==='arm'?-2.45+swing*.35:kind==='elbow'?-.45:kind==='hip'?-.7-swing*.25:1.0+swing*.2;bone.quaternion.copy(rest).multiply(q.setFromAxisAngle(axis,angle));}}};
}
