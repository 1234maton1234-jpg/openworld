export const DEFAULT_CAR_SEATS=[[-.35,.65,0],[.35,.65,0]];
import {VEHICLE_TYPES} from './vehicle-types.mjs';
export function carSeats(value,type='car'){
  const rule=VEHICLE_TYPES[type]||VEHICLE_TYPES.car;
  if(value===undefined)return type==='plane'?[[-.35,1.15,-.6],[.35,1.15,-.6]]:DEFAULT_CAR_SEATS.map(p=>[...p]);
  if(!Array.isArray(value)||![1,2,4].includes(value.length))throw new Error('载具必须为 1、2 或 4 座，包含驾驶员');
  const seats=value.map(p=>{if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)||Math.abs(p[0])>(type==='car'?.85:rule.width/2-.2)||p[1]<.3||p[1]>(type==='car'?1.2:rule.height-.4)||Math.abs(p[2])>(type==='car'?1.5:rule.length/2-.3))throw new Error('座位坐标须为米制 [X,Y,Z]，位于车内');return [...p];});
  for(let i=0;i<seats.length;i++)for(let j=0;j<i;j++)if(Math.hypot(seats[i][0]-seats[j][0],seats[i][2]-seats[j][2])<.45)throw new Error('座位之间至少相隔 0.45 米');
  return seats;
}
export function carSeatPose(car,seat){const [x,sy,sz]=seat,cp=Math.cos(car.pitch||0),sp=Math.sin(car.pitch||0),y=sy*cp-sz*sp,z=sy*sp+sz*cp,c=Math.cos(car.yaw),s=Math.sin(car.yaw);return {x:car.x+x*c+z*s,y:car.y+y-.87,z:car.z-x*s+z*c,yaw:car.yaw,ridingType:car.type||'car',active:true,moving:false,running:false,seated:true,vehicleType:null,crankPhase:0,personalCar:null};}
