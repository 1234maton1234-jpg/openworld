import {AnimationMixer,LoopOnce} from 'three';
export function createRiggedAvatar(model,clips=[]){
  if(!clips.length)return null;
  const mixer=new AnimationMixer(model),actions=new Map(clips.map(clip=>[clip.name,mixer.clipAction(clip)]));let current=null;
  return {update({moving,running,seated,vehicleType,crankPhase=0,dt}){
    const name=vehicleType==='bike'?'cycle':seated?'sit':moving?(running?'run':'walk'):'idle',action=actions.get(name);if(!action)return;
    if(action!==current){current?.fadeOut(.15);action.reset().setEffectiveWeight(1).fadeIn(.15).play();if(name==='sit'){action.setLoop(LoopOnce,1);action.clampWhenFinished=true;}current=action;}
    if(name==='cycle'){action.paused=true;action.time=((crankPhase%(Math.PI*2)+Math.PI*2)%(Math.PI*2))/(Math.PI*2)*action.getClip().duration;}else action.paused=false;
    mixer.update(Math.max(0,Math.min(dt,.1)));
  },dispose(){mixer.stopAllAction();mixer.uncacheRoot(model);}};
}
