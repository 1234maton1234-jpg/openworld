import {Quaternion,Vector3} from 'three';

const movingMeshes=new WeakSet(),axis=new Vector3(0,0,1);
export const isMovingBuildingMesh=mesh=>movingMeshes.has(mesh);

export function createBuildingMotion(object){
  const wheels=[],rotation=new Quaternion(),counter=new Quaternion();
  object.traverse(node=>{
    const spec=node.userData.openworldMotion;
    if(spec?.type!=='ferrisWheel'||!Number.isFinite(spec.period)||spec.period<30||spec.period>600||wheels.length>=4)return;
    const rotors=node.children.filter(child=>child.userData.motionPart==='rotor');if(rotors.length!==1)return;
    const rotor=rotors[0],cabins=rotor.children.filter(child=>child.userData.motionPart==='cabin');
    if(cabins.length<4||cabins.length>32||rotor.quaternion.angleTo(new Quaternion())>1e-6)return;
    wheels.push({rotor,period:spec.period,cabins:cabins.map(cabin=>({node:cabin,rest:cabin.quaternion.clone()}))});
    rotor.traverse(child=>{if(child.isMesh){movingMeshes.add(child);child.castShadow=false;}});
  });
  return {update(seconds){
    if(!Number.isFinite(seconds))return;
    for(const {rotor,period,cabins} of wheels){const angle=((seconds%period)+period)%period/period*Math.PI*2;rotation.setFromAxisAngle(axis,angle);counter.setFromAxisAngle(axis,-angle);rotor.quaternion.copy(rotation);for(const cabin of cabins)cabin.node.quaternion.copy(counter).multiply(cabin.rest);}
  }};
}
