import {carSeats,carSeatPose} from '../shared/car-seats.mjs';

export function rideRenderPose(vehicle,seatIndex,origin){
  if(!vehicle?.group)return null;
  const seat=(vehicle.seats||carSeats(undefined,vehicle.type))[seatIndex];if(!seat)return null;
  const {position,rotation}=vehicle.group;
  return carSeatPose({x:position.x+origin.x*70,y:position.y,z:position.z+origin.z*70,yaw:rotation.y,pitch:rotation.x,type:vehicle.type},seat);
}
