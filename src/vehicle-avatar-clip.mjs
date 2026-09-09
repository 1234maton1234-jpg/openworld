import * as T from 'three';

const boundsCache=new WeakMap();
function boundsFor(group){
  if(boundsCache.has(group))return boundsCache.get(group);
  group.updateWorldMatrix(true,true);const inverse=group.matrixWorld.clone().invert(),bounds=new T.Box3(),matrix=new T.Matrix4();
  group.traverse(o=>{if(!o.isMesh)return;o.geometry.computeBoundingBox();matrix.multiplyMatrices(inverse,o.matrixWorld);bounds.union(o.geometry.boundingBox.clone().applyMatrix4(matrix));});
  boundsCache.set(group,bounds);return bounds;
}
export function createVehicleAvatarClip(root){
  const entries=[],planes=Array.from({length:6},()=>new T.Plane());let target=null;
  function clear(){for(const {mesh,original,copies} of entries){mesh.material=original;for(const material of copies)material.dispose();}entries.length=0;target=null;}
  return {clear,update(vehicle){
    const group=vehicle?.type==='car'?vehicle.group:null;
    if(group!==target){clear();if(!group)return;target=group;
      root.traverse(mesh=>{if(!mesh.isMesh)return;const original=mesh.material,copies=(Array.isArray(original)?original:[original]).map(m=>{const copy=m.clone();copy.clippingPlanes=planes;copy.clipIntersection=false;copy.clipShadows=true;return copy;});entries.push({mesh,original,copies});mesh.material=Array.isArray(original)?copies:copies[0];});
    }
    if(!target)return;
    const bounds=boundsFor(target);if(bounds.isEmpty()){clear();return;}target.updateWorldMatrix(true,false);
    const {min,max}=bounds;
    planes[0].set(new T.Vector3(1,0,0),-min.x);planes[1].set(new T.Vector3(-1,0,0),max.x);
    planes[2].set(new T.Vector3(0,1,0),-min.y);planes[3].set(new T.Vector3(0,-1,0),max.y);
    planes[4].set(new T.Vector3(0,0,1),-min.z);planes[5].set(new T.Vector3(0,0,-1),max.z);
    const cabin=target.userData.occupantClipPlanes;
    if(cabin?.length===6)for(let i=0;i<6;i++){const [x,y,z,c]=cabin[i];planes[i].set(new T.Vector3(x,y,z),c).normalize();}
    for(const plane of planes)plane.applyMatrix4(target.matrixWorld);
  }};
}
