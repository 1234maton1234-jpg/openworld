import {Vector3} from 'three';
const churchSeats=()=>[-1,1].flatMap(side=>[-29,30].map(x=>({position:[x,.99,side*8],yaw:Math.PI/2})));
const knownModels=new Map([['f9d11eb30bd65b925c5352e52d7b6d6de53aa7b081a0c31a2b20e831100c858d',churchSeats]]);
export function collectInteractions(root,hash=''){
  const seats=[];
  root.traverse(node=>{const data=node.userData?.interaction;if(data?.type==='seat'&&Number.isFinite(data.yaw??0))seats.push({root,node,position:[0,0,0],yaw:data.yaw??0});});
  if(!seats.length)for(const seat of knownModels.get(hash)?.()||[])seats.push({...seat,root,node:root});
  return seats;
}
export function seatPosition(seat){seat.node.updateWorldMatrix(true,false);return seat.node.localToWorld(new Vector3(...seat.position));}
export function findInteraction(seats,eye,direction,visible=()=>true){
  let best=null,score=Infinity;
  for(const seat of seats){const target=seatPosition(seat).add(new Vector3(0,.4,0)),delta=target.clone().sub(eye),distance=delta.length();if(distance>3.2||distance<.01||delta.normalize().dot(direction)<.82||!visible(target,distance))continue;if(distance<score){score=distance;best=seat;}}
  return best;
}
