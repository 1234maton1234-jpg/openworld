import {carSeatPose,carSeats} from '../shared/car-seats.mjs';

export function createCarRides(peers){
  const ownerFor=id=>[...peers.values()].find(p=>p.id===id);
  function leave(peer){const pose=peer.ridePose;peer.ride=null;peer.ridePose=null;if(peer.pose)peer.pose={...peer.pose,seated:false,ride:null};return pose;}
  function enter(peer,ownerId){
    const owner=ownerFor(ownerId),car=owner?.pose?.personalCar;
    if(peer.ride)throw new Error('你已经在车内');
    if(!peer.pose?.active||peer.pose.seated||peer.pose.vehicleType||peer.pose.personalCar?.driving)throw new Error('请先下车或起身');
    if(!owner||owner===peer||!car||Date.now()-owner.updated>3000)throw new Error('车辆已离开');
    if(Math.hypot(peer.pose.x-car.x,peer.pose.z-car.z)>(car.type==='plane'?10:car.type==='boat'?8:3.2)||Math.abs(peer.pose.y-car.y)>(car.type==='boat'?6:3))throw new Error('请靠近车辆');
    if((owner.carSpeed||0)>1.5)throw new Error('请等车辆停稳后再上车');
    const seats=owner.seats||carSeats(),used=new Set([...peers.values()].filter(p=>p.ride?.owner===ownerId).map(p=>p.ride.seat));
    const index=seats.findIndex((_,i)=>i>0&&!used.has(i));if(index<0)throw new Error('车辆已满员');
    peer.ride={owner:ownerId,seat:index};return update(peer);
  }
  function update(peer){
    if(!peer.ride)return null;const owner=ownerFor(peer.ride.owner),car=owner?.pose?.personalCar,seat=owner?.seats?.[peer.ride.seat]||(owner?.seats?null:carSeats()[peer.ride.seat]);
    if(!car||!seat||owner.ride||Date.now()-owner.updated>3000)return null;
    const pose=carSeatPose(car,seat);peer.ridePose=pose;peer.pose={...pose,ride:{...peer.ride}};peer.lastPosition=pose;peer.dirty=true;return {...peer.ride,pose};
  }
  return {enter,leave,update};
}
