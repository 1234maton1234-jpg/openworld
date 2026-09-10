import * as T from 'three';
import {releaseModelLods} from './model-lod.mjs';
import {carSeats} from '../shared/car-seats.mjs';

export function releaseCar(group){releaseModelLods(group);const resources=new Set();group.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}});group.removeFromParent();for(const r of resources)r.dispose();}
export function animateVehicleModel(vehicle,phase,speed=0,steer=0){
  const amount=T.MathUtils.clamp(Math.abs(speed)/3,0,1),gait=phase*.72;
  for(const part of vehicle.horseParts||[]){
    const side=part.code==='fl'||part.code==='rr'?0:Math.PI,swing=Math.sin(gait+side+part.index*.55),lift=Math.max(0,Math.cos(gait+side+part.index*.55));
    part.node.rotation.copy(part.rest);
    if(part.kind==='leg')part.node.rotation.x+=swing*.62*amount;
    else if(part.kind==='lower')part.node.rotation.x+=(lift*.72-.16)*amount;
    else if(part.kind==='head'){part.node.rotation.x+=Math.sin(gait*2+part.index)*.055*amount;part.node.rotation.y+=steer*.09;}
    else if(part.kind==='tail')part.node.rotation.x+=Math.sin(gait*2.4+part.index)*.24*amount;
  }
}
export function prepareCarModel(model,type='car'){
  model.updateMatrixWorld(true);const box=new T.Box3().setFromObject(model),center=box.getCenter(new T.Vector3()),group=new T.Group(),wheels=[],nodes=[],horseParts=[];
  model.position.sub(new T.Vector3(center.x,box.min.y,center.z));group.add(model);group.updateMatrixWorld(true);
  model.traverse(o=>{if(/^wheel_(fl|fr|rl|rr)$/i.test(o.name))nodes.push(o);const match=/^horse-(leg|lower)-(fl|fr|rl|rr)-(\d+)$/i.exec(o.name)||/^horse-(head|tail)-(\d+)$/i.exec(o.name);if(match){const paired=match.length===4;horseParts.push({node:o,kind:match[1].toLowerCase(),code:paired?match[2].toLowerCase():'',index:Number(match[paired?3:2]),rest:o.rotation.clone()});}if(o.isMesh)o.castShadow=o.receiveShadow=true;});
  for(const node of nodes){const pivot=new T.Group(),spin=new T.Group(),position=node.getWorldPosition(new T.Vector3()),size=new T.Box3().setFromObject(node).getSize(new T.Vector3());group.attach(node);pivot.position.copy(position);group.add(pivot);pivot.add(spin);spin.attach(node);wheels.push({pivot,spin,radius:Math.max(.1,Math.max(size.y,size.z)/2),front:/_f[lr]$/i.test(node.name)});}
  let seats;model.traverse(o=>{if(o.userData?.vehicle?.seats!==undefined)seats=o.userData.vehicle.seats;});
  return {group,wheels,pedals:[],horseParts,seats:carSeats(seats,type)};
}
