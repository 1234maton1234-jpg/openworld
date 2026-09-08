import {Vector3} from 'three';

export function createClimbing({probe,blocked,surface}){
  let attached=null,stamina=100,cooldown=0,approach=0;
  const reset=()=>{attached=null;approach=0;cooldown=.4;};
  function mantle(position){const inward=attached.normal.clone().negate(),target=position.clone().addScaledVector(inward,.9),feet=position.y-1.7,top=surface(target.x,target.z,feet+1.3);if(!Number.isFinite(top)||top<feet-.15||top>feet+1.3)return false;target.y=top+1.7;const raised=position.clone();raised.y=target.y;for(let i=0;i<=8;i++)if(blocked(position.clone().lerp(raised,i/8))||blocked(raised.clone().lerp(target,i/8)))return false;position.copy(target);reset();return true;}
  return {reset,get active(){return !!attached;},get stamina(){return stamina;},get yaw(){return attached?Math.atan2(attached.normal.x,attached.normal.z):null;},
    release(position,jump=false){if(!attached)return null;const normal=attached.normal.clone();reset();cooldown=1;const target=position.clone().addScaledVector(normal,.45);if(!blocked(target))position.copy(target);return jump?5:0;},
    update(dt,{position,yaw,forward=0,right=0,enabled=true,paused=false,grounded=false}){
      dt=Math.max(0,Math.min(dt,.05));cooldown=Math.max(0,cooldown-dt);
      if(!enabled){reset();return {handled:false,moving:false};}if(paused)return {handled:!!attached,moving:false};
      if(!attached){if(grounded)stamina=Math.min(100,stamina+25*dt);if(forward<=0||cooldown||stamina<10){approach=0;return {handled:false,moving:false};}const direction=new Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),chest=position.clone();chest.y-=.45;const hit=probe(chest,direction,.8);if(!hit||hit.distance>.65){approach=0;return {handled:false,moving:false};}approach+=dt;if(approach<.15)return {handled:false,moving:false};attached=hit;}
      if(grounded&&forward<0){reset();return {handled:false,moving:false};}
      const before=position.clone(),inward=attached.normal.clone().negate(),chest=position.clone();chest.y-=.45;
      const current=probe(chest,inward,.85);if(!current){if(forward>0&&mantle(position))return {handled:true,moving:true};reset();return {handled:false,moving:false};}attached=current;
      const norm=Math.max(1,Math.hypot(forward,right)),tangent=new Vector3(attached.normal.z,0,-attached.normal.x),target=position.clone().addScaledVector(tangent,right/norm*1.8*dt);target.y+=forward/norm*(forward<0?2.6:2.2)*dt;
      const sample=target.clone();sample.y-=.45;const next=probe(sample,inward,.9);
      if(next&&next.normal.dot(attached.normal)>.7){target.x=next.point.x+next.normal.x*.48;target.z=next.point.z+next.normal.z*.48;if(!blocked(target)){position.copy(target);attached=next;}}
      else if(forward>0&&mantle(position))return {handled:true,moving:true};
      const moving=position.distanceToSquared(before)>1e-8;stamina=Math.max(0,stamina-dt*(moving?6:1.5));if(!stamina){reset();cooldown=1;return {handled:false,moving};}return {handled:true,moving};
    }};
}
