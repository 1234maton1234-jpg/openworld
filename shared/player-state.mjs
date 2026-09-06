import {MAX_COORDINATE,PLOT} from './terrain.mjs';
export const PLAYER_RADIUS=180,PLAYER_LIMIT=16;
export function playerPose(value){
  if(!value||typeof value!=='object')return null;
  const {x,y,z,yaw}=value,limit=MAX_COORDINATE*PLOT.cell;
  if(![x,y,z,yaw].every(Number.isFinite)||Math.abs(x)>limit||Math.abs(z)>limit||y< -200||y>2000)return null;
  return {x,y,z,yaw:Math.atan2(Math.sin(yaw),Math.cos(yaw)),active:value.active===true,moving:value.moving===true,running:value.running===true,seated:value.seated===true,
    vehicleType:['bike','car'].includes(value.vehicleType)?value.vehicleType:null,crankPhase:Number.isFinite(value.crankPhase)?value.crankPhase%(2*Math.PI):0};
}
export function blendPose(a,b,t){
  const distance=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);if(distance>40)return {...b};
  return {...b,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,yaw:a.yaw+Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw))*t};
}
