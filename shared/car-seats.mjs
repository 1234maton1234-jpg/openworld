export const DEFAULT_CAR_SEATS=[[-.35,.65,0],[.35,.65,0]];
export function carSeats(value){
  if(value===undefined)return DEFAULT_CAR_SEATS.map(p=>[...p]);
  if(!Array.isArray(value)||![1,2,4].includes(value.length))throw new Error('小汽车必须为 1、2 或 4 座，包含驾驶员');
  const seats=value.map(p=>{if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)||Math.abs(p[0])>.85||p[1]<.3||p[1]>1.2||Math.abs(p[2])>1.5)throw new Error('座位坐标须为米制 [X,Y,Z]，位于车内');return [...p];});
  for(let i=0;i<seats.length;i++)for(let j=0;j<i;j++)if(Math.hypot(seats[i][0]-seats[j][0],seats[i][2]-seats[j][2])<.45)throw new Error('座位之间至少相隔 0.45 米');
  return seats;
}
export function carSeatPose(car,seat){const [x,y,z]=seat,c=Math.cos(car.yaw),s=Math.sin(car.yaw);return {x:car.x+x*c+z*s,y:car.y+y-.87,z:car.z-x*s+z*c,yaw:car.yaw,active:true,moving:false,running:false,seated:true,vehicleType:null,crankPhase:0,personalCar:null};}
