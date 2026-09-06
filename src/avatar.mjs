import * as T from 'three';

export function cyclingLeg(phase){
  const hip=new T.Vector3(0,.87,0),foot=new T.Vector3(0,.33+.17*Math.sin(phase),-.23+.17*Math.cos(phase)),delta=foot.clone().sub(hip),d=delta.length(),bend=Math.sqrt(Math.max(0,.42**2-d*d/4));
  const knee=hip.clone().add(foot).multiplyScalar(.5).add(new T.Vector3(0,-delta.z,delta.y).normalize().multiplyScalar(bend));return {hip,knee,foot};
}
export function cyclingArm(side){
  const shoulder=new T.Vector3(side*.31,.46,0).applyAxisAngle(new T.Vector3(1,0,0),-.55).add(new T.Vector3(0,.87,0)),hand=new T.Vector3(side*.3,.96,-.85),delta=hand.clone().sub(shoulder),direction=delta.clone().normalize();
  const bend=new T.Vector3(side,0,0);bend.addScaledVector(direction,-bend.dot(direction)).normalize();
  const elbow=shoulder.clone().add(hand).multiplyScalar(.5).addScaledVector(bend,Math.sqrt(Math.max(0,.4**2-delta.lengthSq()/4)));return {shoulder,elbow,hand};
}

export function createAvatar(scene){
  const root=new T.Group(),skin=new T.MeshStandardMaterial({color:'#d5a47e',roughness:.9}),shirt=new T.MeshStandardMaterial({color:'#4c8586',roughness:.9}),pants=new T.MeshStandardMaterial({color:'#354854',roughness:.95}),shoe=new T.MeshStandardMaterial({color:'#293335',roughness:1}),hair=new T.MeshStandardMaterial({color:'#493b32',roughness:1});
  function box(parent,w,h,d,x,y,z,material){const m=new T.Mesh(new T.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
  const torso=new T.Group();torso.position.y=.87;root.add(torso);
  box(torso,.46,.52,.28,0,.25,0,shirt);box(torso,.32,.34,.3,0,.7,0,skin);box(torso,.34,.12,.32,0,.89,0,hair);
  for(const x of [-.08,.08])box(torso,.04,.035,.02,x,.73,-.158,shoe);
  const legs=[],arms=[];
  for(const side of [-1,1]){const leg=new T.Group();leg.position.set(side*.18,0,0);root.add(leg);const upper=box(leg,.2,1,.23,0,0,0,pants),lower=box(leg,.18,1,.21,0,0,0,pants),foot=box(leg,.22,.14,.34,0,0,0,shoe);legs.push({upper,lower,foot});
    const upperArm=box(root,.17,1,.2,0,0,0,shirt),forearm=box(root,.145,1,.17,0,0,0,skin),hand=box(root,.14,.14,.16,0,0,0,skin);hand.name=side<0?'hand-left':'hand-right';arms.push({upperArm,forearm,hand,side});
  }
  scene.add(root);root.visible=false;let phase=0,custom=null;
  const bodyParts=[...root.children];
  function setModel(model){const old=custom;if(old)root.remove(old);custom=model;if(model){const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),scale=1.8/size.y;const holder=new T.Group();holder.add(model);model.position.sub(new T.Vector3(center.x,bounds.min.y,center.z));holder.scale.setScalar(scale);custom=holder;root.add(holder);}return old;}
  function segment(mesh,a,b){mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.y=a.distanceTo(b);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());}
  return {root,setModel,update({position,yaw,visible,moving,seated,dt,vehicleType,crankPhase=0}){root.visible=visible;root.position.copy(position);root.rotation.y=yaw;for(const part of bodyParts)part.visible=!custom;if(custom)return;torso.rotation.x=vehicleType==='bike'?-.55:0;if(moving)phase+=dt*9;for(let i=0;i<2;i++){
    const swing=moving?Math.sin(phase+i*Math.PI)*.5:0,hip=new T.Vector3(0,.87,0);let knee,foot;
    if(vehicleType==='bike')({knee,foot}=cyclingLeg(crankPhase+i*Math.PI));
    else if(seated){knee=new T.Vector3(0,.83,-.4);foot=new T.Vector3(0,.43,-.4);}
    else{knee=new T.Vector3(0,-.4,0).applyAxisAngle(new T.Vector3(1,0,0),swing).add(hip);foot=new T.Vector3(0,-.79,0).applyAxisAngle(new T.Vector3(1,0,0),swing).add(hip);}
    segment(legs[i].upper,hip,knee);segment(legs[i].lower,knee,foot);legs[i].foot.position.copy(foot).add(new T.Vector3(0,0,-.07));
    const arm=arms[i];let shoulder,elbow,hand;
    if(vehicleType==='bike')({shoulder,elbow,hand}=cyclingArm(arm.side));
    else{shoulder=new T.Vector3(arm.side*.31,1.33,0);const axis=new T.Vector3(1,0,0),angle=seated?.7:-swing;elbow=new T.Vector3(0,-.32,0).applyAxisAngle(axis,angle).add(shoulder);hand=new T.Vector3(0,-.6,0).applyAxisAngle(axis,angle).add(shoulder);}
    segment(arm.upperArm,shoulder,elbow);segment(arm.forearm,elbow,hand);arm.hand.position.copy(hand);
  }}};
}

export function chasePosition(eye,direction,distance=4){return eye.clone().addScaledVector(direction,-distance).add(new T.Vector3(0,.8,0));}
