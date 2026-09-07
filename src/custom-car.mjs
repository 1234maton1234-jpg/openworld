import * as T from 'three';
import {carSeats} from '../shared/car-seats.mjs';

export function releaseCar(group){const resources=new Set();group.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}});group.removeFromParent();for(const r of resources)r.dispose();}
export function prepareCarModel(model){
  model.updateMatrixWorld(true);const box=new T.Box3().setFromObject(model),center=box.getCenter(new T.Vector3()),group=new T.Group(),wheels=[],nodes=[];
  model.position.sub(new T.Vector3(center.x,box.min.y,center.z));group.add(model);group.updateMatrixWorld(true);
  model.traverse(o=>{if(/^wheel_(fl|fr|rl|rr)$/i.test(o.name))nodes.push(o);if(o.isMesh)o.castShadow=o.receiveShadow=true;});
  for(const node of nodes){const pivot=new T.Group(),spin=new T.Group(),position=node.getWorldPosition(new T.Vector3()),size=new T.Box3().setFromObject(node).getSize(new T.Vector3());group.attach(node);pivot.position.copy(position);group.add(pivot);pivot.add(spin);spin.attach(node);wheels.push({pivot,spin,radius:Math.max(.1,Math.max(size.y,size.z)/2),front:/_f[lr]$/i.test(node.name)});}
  let seats;model.traverse(o=>{if(o.userData?.vehicle?.seats!==undefined)seats=o.userData.vehicle.seats;});
  return {group,wheels,pedals:[],seats:carSeats(seats)};
}
