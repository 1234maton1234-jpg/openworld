export const VEHICLE_TYPES=Object.freeze({
  car:{name:'小汽车',width:1.9,height:2,length:4.1,max:30,accel:7.5,reverse:5,radius:.95},
  plane:{name:'飞机',width:10,height:3.5,length:8,max:48,accel:6,reverse:2,radius:5},
  boat:{name:'船',width:3,height:3,length:7,max:16,accel:3,reverse:3,radius:1.5}
});
export function vehicleCategory(value='car'){
  if(typeof value!=='string'||!Object.hasOwn(VEHICLE_TYPES,value))throw new Error('载具类别须为 car、plane 或 boat');
  return value;
}
