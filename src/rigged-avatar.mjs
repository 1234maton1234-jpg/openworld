import {AnimationMixer,LoopOnce} from 'three';
import {createClimbingPose} from './climbing-pose.mjs';
export function createRiggedAvatar(model,clips=[]){
  if(!clips.length)return null;
  const mixer=new AnimationMixer(model),actions=new Map(clips.map(clip=>[clip.name,mixer.clipAction(clip)])),climbPose=createClimbingPose(model);let current=null;
  return {update({moving,running,seated,climbing=false,vehicleType,crankPhase=0,dt}){
    climbPose.reset();const name=climbing?(actions.has('climb')?'climb':'idle'):vehicleType==='bike'?'cycle':seated?'sit':moving?(running?'run':'walk'):'idle',action=actions.get(name);if(!action)return;
    if(action!==current){current?.fadeOut(.15);action.reset().setEffectiveWeight(1).fadeIn(.15).play();if(name==='sit'){action.setLoop(LoopOnce,1);action.clampWhenFinished=true;}current=action;}
    if(name==='cycle'){action.paused=true;action.time=((crankPhase%(Math.PI*2)+Math.PI*2)%(Math.PI*2))/(Math.PI*2)*action.getClip().duration;}else action.paused=false;
    mixer.update(Math.max(0,Math.min(dt,.1)));
    if(climbing&&!actions.has('climb'))climbPose.update(dt,moving);
  },dispose(){mixer.stopAllAction();mixer.uncacheRoot(model);}};
}
