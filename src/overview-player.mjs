import {PLOT} from '../shared/terrain.mjs';

export function capturePlayerAnchor(origin,position,yaw,avatarYaw=yaw){
  return {x:origin.x*PLOT.cell+position.x,y:position.y,z:origin.z*PLOT.cell+position.z,yaw,avatarYaw};
}

export function localPlayerAnchor(origin,anchor){
  return {x:anchor.x-origin.x*PLOT.cell,y:anchor.y,z:anchor.z-origin.z*PLOT.cell,yaw:anchor.yaw,avatarYaw:anchor.avatarYaw};
}
