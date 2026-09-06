import * as T from 'three';

export const VEHICLES={bike:{name:'单车',max:9,accel:3,reverse:2,radius:.4,length:1.8},car:{name:'小汽车',max:30,accel:7.5,reverse:5,radius:.95,length:4.1}};
const approach=(a,b,rate,dt)=>a+(b-a)*(1-Math.exp(-rate*dt));
const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
function carStep(v,input,dt,canMove){
  const c=VEHICLES.car,count=Math.max(1,Math.ceil(dt*120)),step=dt/count;
  v.steer??=0;v.yawRate??=0;v.travelHeading??=v.heading;v.reverseWait??=0;
  for(let i=0;i<count;i++){
    const throttle=Number(!!input.forward)-Number(!!input.back),opposing=throttle&&v.speed*throttle<0;
    if(input.brake||input.handbrake||opposing){const decel=input.brake?16:opposing?12:7;v.speed=Math.sign(v.speed)*Math.max(0,Math.abs(v.speed)-decel*step);v.reverseWait=opposing?.2:0;}
    else if(throttle){if(v.reverseWait>0)v.reverseWait=Math.max(0,v.reverseWait-step);else{const acceleration=throttle>0?c.accel*(1-.55*Math.max(0,v.speed)/c.max):4;v.speed=T.MathUtils.clamp(v.speed+throttle*acceleration*step,-c.reverse,c.max);}}
    else{v.speed=Math.sign(v.speed)*Math.max(0,Math.abs(v.speed)-(.65+.0025*v.speed*v.speed)*step);v.reverseWait=0;}
    const steer=Number(!!input.left)-Number(!!input.right),speed=Math.abs(v.speed);
    v.steer=approach(v.steer,steer,steer?6:9,step);
    v.steerAngle=v.steer*(.55/(1+speed*.075));
    const maxYaw=.95/(1+speed*.025),target=T.MathUtils.clamp(v.speed/2.6*Math.tan(v.steerAngle),-maxYaw,maxYaw)*(input.handbrake&&speed>4?1.65:1);
    v.yawRate=approach(v.yawRate,target,7,step);
    const heading=v.heading+v.yawRate*step,grip=input.handbrake?1.8:10;
    const travel=v.travelHeading+angleDelta(v.travelHeading,heading)*(1-Math.exp(-grip*step));
    const x=v.x-Math.sin(travel)*v.speed*step,z=v.z-Math.cos(travel)*v.speed*step;
    if(!canMove(x,z,heading)){v.speed=0;v.yawRate=0;v.travelHeading=v.heading;break;}
    v.x=x;v.z=z;v.heading=heading;v.travelHeading=travel;
  }
}
export function driveStep(v,input,dt,canMove){
  if(v.type==='car'){carStep(v,input,Math.max(0,Math.min(dt,.05)),canMove);return;}
  dt=Math.max(0,Math.min(dt,.05));const c=VEHICLES[v.type],throttle=Number(!!input.forward)-Number(!!input.back),brake=input.brake?14:throttle===0?1.8:0;
  v.speed=brake?Math.sign(v.speed)*Math.max(0,Math.abs(v.speed)-brake*dt):Math.max(-c.reverse,Math.min(c.max,v.speed+throttle*c.accel*dt));
  const steer=Number(!!input.left)-Number(!!input.right),turn=steer*Math.min(1.3,Math.abs(v.speed)*.22)*Math.sign(v.speed)*dt;
  v.steerAngle=steer*.35;
  const steps=Math.max(1,Math.ceil(Math.abs(v.speed)*dt/.15));
  for(let i=0;i<steps;i++){const heading=v.heading+turn/steps,x=v.x-Math.sin(heading)*v.speed*dt/steps,z=v.z-Math.cos(heading)*v.speed*dt/steps;
    if(!canMove(x,z,heading)){v.speed=0;break;}v.x=x;v.z=z;v.heading=heading;
  }
}
export function createVehicleModel(type){
  const group=new T.Group(),wheels=[],materials={paint:new T.MeshStandardMaterial({color:type==='car'?'#bf6548':'#4b938a',roughness:.45,metalness:.25}),rubber:new T.MeshStandardMaterial({color:'#242a2b',roughness:1}),metal:new T.MeshStandardMaterial({color:'#aebabc',metalness:.65,roughness:.3}),glass:new T.MeshStandardMaterial({color:'#28434d',roughness:.22}),lamp:new T.MeshStandardMaterial({color:'#fff0c8',emissive:'#ddbd70',emissiveIntensity:.5})};
  function mesh(g,m,x,y,z,rx=0,ry=0,rz=0){const o=new T.Mesh(g,materials[m]);o.position.set(x,y,z);o.rotation.set(rx,ry,rz);o.castShadow=o.receiveShadow=true;group.add(o);return o;}
  const box=(x,y,z,w,h,d,m)=>mesh(new T.BoxGeometry(w,h,d),m,x,y,z);
  function tube(a,b,r,m='paint'){const x=new T.Vector3(...a),y=new T.Vector3(...b),o=mesh(new T.CylinderGeometry(r,r,x.distanceTo(y),8),m,...x.clone().add(y).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),y.sub(x).normalize());}
  function assembleWheel(start,x,y,z,radius){const pivot=new T.Group(),spin=new T.Group();pivot.position.set(x,y,z);for(const part of group.children.slice(start)){part.position.sub(pivot.position);spin.add(part);}pivot.add(spin);group.add(pivot);wheels.push({pivot,spin,radius,front:z<0});}
  if(type==='car'){
    box(0,.68,0,1.8,.62,4.1,'paint');box(0,1.18,.25,1.55,.62,1.95,'glass');box(0,1.53,.25,1.65,.13,2.05,'paint');
    for(const x of [-.77,.77])for(const z of [-.68,1.16])box(x,1.2,z,.12,.64,.13,'paint');
    for(const z of [-2.08,2.08])box(0,.48,z,1.75,.16,.13,'metal');
    for(const x of [-.58,.58])box(x,.8,-2.065,.4,.2,.045,'lamp');
    for(const x of [-.94,.94])for(const z of [-1.25,1.25]){const start=group.children.length;mesh(new T.CylinderGeometry(.36,.36,.22,20),'rubber',x,.38,z,0,0,Math.PI/2);mesh(new T.CylinderGeometry(.1,.1,.25,12),'metal',x,.38,z,0,0,Math.PI/2);
      for(const side of [-1,1])for(let i=0;i<5;i++){const angle=i*Math.PI*2/5; tube([x+side*.125,.38+Math.cos(angle)*.07,z+Math.sin(angle)*.07],[x+side*.125,.38+Math.cos(angle)*.28,z+Math.sin(angle)*.28],.035,'metal');}
      assembleWheel(start,x,.38,z,.36);
    }
  }else{
    for(const z of [-.73,.73]){const start=group.children.length;mesh(new T.TorusGeometry(.34,.055,8,20),'rubber',0,.4,z,0,Math.PI/2);for(let i=0;i<8;i++){const a=i*Math.PI/4;tube([0,.4,z],[0,.4+Math.sin(a)*.31,z+Math.cos(a)*.31],.012,'metal');}assembleWheel(start,0,.4,z,.34);}
    const a=[0,.4,.73],b=[0,.4,-.73],c=[0,.5,.05],d=[0,.94,.32],e=[0,.98,-.48];
    for(const [u,v] of [[a,c],[a,d],[c,d],[d,e],[e,c],[e,b]])tube(u,v,.038);
    tube(d,[0,1.12,.35],.03,'metal');box(0,1.14,.35,.3,.1,.4,'rubber');tube(e,[0,1.2,-.5],.035,'metal');tube([-.35,1.2,-.5],[.35,1.2,-.5],.035,'rubber');box(0,.47,.05,.45,.06,.16,'metal');
  }
  const pedals=[];if(type==='bike')for(const side of [-1,1])pedals.push(box(side*.22,.5,.05,.2,.06,.16,'metal'));
  return {group,wheels,pedals};
}
export function createVehicles(scene,{surface,obstacle,origin}){
  const items=['bike','car'].map((type,i)=>{const {group,wheels,pedals}=createVehicleModel(type);scene.add(group);return {type,x:i?4:-4,z:42,heading:0,speed:0,crankPhase:0,group,wheels,pedals,y:null};});
  let active=null,orbit=0,pitch=.3,chaseHeading=0,lookIdle=0;
  function rebase(){const o=origin();for(const v of items){v.group.position.set(v.x-o.x*70,v.y??0,v.z-o.z*70);v.group.rotation.y=v.heading;v.group.updateMatrixWorld(true);}}
  function clear(v,x,z,heading,base){const c=VEHICLES[v.type];for(const along of [-c.length/2+.2,0,c.length/2-.2]){const px=x-Math.sin(heading)*along,pz=z-Math.cos(heading)*along,h=surface(px,pz);if(h<.5||Math.abs(h-base)>.45||obstacle(px,pz,h,c.radius))return false;for(const other of items)if(other!==v&&Math.hypot(px-other.x,pz-other.z)<c.radius+VEHICLES[other.type].radius)return false;}return true;}
  function exit(){if(!active)return null;const v=active,c=VEHICLES[v.type];for(const side of [-1,1])for(const along of [0,-c.length/2-1,c.length/2+1]){const x=v.x+Math.cos(v.heading)*(c.radius+1)*side-Math.sin(v.heading)*along,z=v.z-Math.sin(v.heading)*(c.radius+1)*side-Math.cos(v.heading)*along,h=surface(x,z);if(h>=.5&&Math.abs(h-v.y)<1&&!obstacle(x,z,h,.35)){active=null;v.speed=0;return {x,y:h+1.7,z,heading:v.heading};}}return null;}
  return {
    get active(){return active;},
    rebase,
    targets(){return items.map(v=>({root:v.group,node:v.group,position:[0,.8,0],yaw:v.heading,vehicle:v}));},
    enter(v){active=v;v.speed=0;v.yawRate=0;v.travelHeading=v.heading;v.steer=0;v.reverseWait=0;orbit=0;pitch=.3;chaseHeading=v.heading;lookIdle=0;},exit,
    stop(){if(active)active.speed=0;active=null;},
    look(dx,dy){orbit-=dx*.0025;pitch=T.MathUtils.clamp(pitch+dy*.002,-.05,.9);lookIdle=1.5;},
    blocks(x,z,r=.35){return items.some(v=>{const dx=x-v.x,dz=z-v.z,c=VEHICLES[v.type],side=dx*Math.cos(v.heading)-dz*Math.sin(v.heading),along=dx*Math.sin(v.heading)+dz*Math.cos(v.heading);return Math.abs(side)<c.radius+r&&Math.abs(along)<c.length/2+r;});},
    update(dt,keys,enabled,camera){
      for(const v of items){if(v.y===null)v.y=surface(v.x,v.z);if(v===active&&enabled){driveStep(v,{forward:keys.has('KeyW'),back:keys.has('KeyS'),left:keys.has('KeyA'),right:keys.has('KeyD'),brake:keys.has('Space'),handbrake:keys.has('ShiftLeft')||keys.has('ShiftRight')},dt,(x,z,h)=>clear(v,x,z,h,v.y));v.y=surface(v.x,v.z);}}rebase();
      if(active&&enabled){chaseHeading+=angleDelta(chaseHeading,active.heading)*(1-Math.exp(-6*dt));lookIdle=Math.max(0,lookIdle-dt);if(!lookIdle&&Math.abs(active.speed)>2)orbit+=angleDelta(orbit,0)*(1-Math.exp(-2*dt));}
      if(active){const v=active,o=origin(),angle=chaseHeading+orbit,d=v.type==='car'?6+Math.abs(v.speed)*.045:4.5,target=new T.Vector3(v.x-o.x*70,v.y+1,v.z-o.z*70);if(enabled){v.crankPhase+=v.speed*dt*1.4;v.pedals.forEach((p,i)=>{const a=v.crankPhase+i*Math.PI;p.position.y=.5+.17*Math.sin(a);p.position.z=.05+.17*Math.cos(a);});for(const wheel of v.wheels){wheel.spin.rotation.x-=v.speed*dt/wheel.radius;wheel.pivot.rotation.y=wheel.front?v.steerAngle||0:0;}}camera.position.set(target.x+Math.sin(angle)*d,target.y+1.4+Math.sin(pitch)*d,target.z+Math.cos(angle)*d);camera.lookAt(target);}
    }
  };
}
