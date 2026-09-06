import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createAvatar} from './avatar.mjs';
import {createVehicleModel} from './vehicles.mjs';
import {blendPose,playerPose} from '../shared/player-state.mjs';
import {TERRAIN} from '../shared/terrain.mjs';
import {prepareCarModel,releaseCar} from './custom-car.mjs';

function release(root){
  const resources=new Set();root.traverse(o=>{if(o.geometry&&!o.isSprite)resources.add(o.geometry);if(o.skeleton)resources.add(o.skeleton);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){resources.add(m);for(const value of Object.values(m))if(value?.isTexture)resources.add(value);}});for(const value of resources)value.dispose();root.removeFromParent();
}
function nameTag(name){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
  const ctx=canvas.getContext('2d');ctx.font='600 38px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=6;ctx.strokeStyle='#172027cc';ctx.strokeText(name,256,48,490);ctx.fillStyle='#ffffff';ctx.fillText(name,256,48,490);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:true,toneMapped:false,sizeAttenuation:false}));sprite.scale.set(.22,.04125,1);return sprite;
}
export function createMultiplayer(scene,{origin,onError,onRestore,onDisconnect}){
  const peers=new Map(),loader=new GLTFLoader();let socket,retry,timer,stopped=false,delay=1000,lastPose=null,lastUpdate=0,loading=0,identity,connection=0;
  let welcomed=false,restoredIdentity,guestPose=null,lastGuestSave=0;
  const guestKey=`openworld:guest-position:${TERRAIN.seed}:${TERRAIN.version}`;
  function saveGuest(){if(identity!==null||!guestPose)return;try{localStorage.setItem(guestKey,JSON.stringify(guestPose));}catch{}}
  const status=value=>{document.querySelector('#world').dataset.multiplayer=value;};
  function remove(id){const p=peers.get(id);if(!p)return;peers.delete(id);const custom=p.avatar.setModel(null);if(custom)release(custom);release(p.avatar.root);release(p.label);if(p.vehicle)release(p.vehicle.group);if(p.car)releaseCar(p.car.group);}
  function clear(){for(const id of peers.keys())remove(id);}
  function connect(){
    if(stopped||identity===undefined)return;welcomed=false;const current=++connection;status('connecting');socket=new WebSocket(location.origin.replace(/^http/,'ws')+'/realtime');const ws=socket;
    ws.onopen=()=>{if(current!==connection)return;delay=1000;status('online');};
    ws.onmessage=event=>{
      if(current!==connection)return;let message;try{message=JSON.parse(event.data);}catch{return;}
      if(message.type==='welcome'){
        if(message.userId!==identity){onError('登录状态已变化，请刷新页面');ws.close();return;}
        if(restoredIdentity!==identity){let position=message.position;if(identity===null)try{position=JSON.parse(localStorage.getItem(guestKey));}catch{}const valid=playerPose(position);lastPose=null;guestPose=null;restoredIdentity=identity;if(valid?.active)onRestore?.(valid);}
        welcomed=true;return;
      }
      if(message.type!=='snapshot'||!Array.isArray(message.players))return;
      const present=new Set();
      for(const state of message.players){present.add(state.id);let p=peers.get(state.id);
        if(!p){const avatar=createAvatar(scene),label=nameTag(state.name);scene.add(label);avatar.root.traverse(o=>{o.castShadow=false;});p={avatar,label,name:state.name,target:state,pose:{...state},avatarId:undefined,loading:false,retryAt:0,vehicle:null};peers.set(state.id,p);}
        if(p.name!==state.name){release(p.label);p.label=nameTag(state.name);scene.add(p.label);p.name=state.name;}
        p.target=state;
      }
      for(const id of peers.keys())if(!present.has(id))remove(id);
      document.querySelector('#world').dataset.nearbyPlayers=String(peers.size);
    };
    ws.onclose=event=>{if(current!==connection)return;onDisconnect?.();clear();status('offline');document.querySelector('#world').dataset.nearbyPlayers='0';if(stopped)return;if(event.code===4001){onError('此账号已在另一个页面进入小镇');return;}retry=setTimeout(connect,delay+Math.random()*300);delay=Math.min(8000,delay*2);};
    ws.onerror=()=>ws.close();
  }
  function send(){if(!welcomed||socket?.readyState!==WebSocket.OPEN||!lastPose||socket.bufferedAmount>4096)return;socket.send(JSON.stringify({type:'pose',pose:{...lastPose,moving:lastPose.moving&&performance.now()-lastUpdate<250}}));}
  function loadModel(id,p){
    const wanted=p.target.avatar;if(p.loading||p.avatarId===wanted||loading>=2||performance.now()<p.retryAt)return;
    if(!wanted){const old=p.avatar.setModel(null);if(old)release(old);p.avatarId=null;return;}
    p.loading=true;loading++;
    loader.loadAsync('/api/avatar/'+encodeURIComponent(wanted)+'.glb').then(gltf=>{
      if(peers.get(id)!==p||p.target.avatar!==wanted){release(gltf.scene);return;}
      gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=true;}});
      const old=p.avatar.setModel(gltf.scene,gltf.animations);if(old)release(old);p.avatarId=wanted;
    }).catch(()=>{p.retryAt=performance.now()+15000;}).finally(()=>{p.loading=false;loading--;});
  }
  function updateCar(id,p,dt,o){
    const target=p.target.personalCar;if(!target){if(p.car)releaseCar(p.car.group);p.car=null;p.carPose=null;return;}
    if(!p.car){p.car={...createVehicleModel('car'),modelId:null};scene.add(p.car.group);}
    const car=p.car,wanted=p.target.carModel||null;
    if(!wanted&&car.modelId){releaseCar(car.group);p.car={...createVehicleModel('car'),modelId:null};scene.add(p.car.group);return;}
    if(wanted!==car.modelId&&!p.carLoading&&loading<2&&performance.now()>(p.carRetry||0)){
      p.carLoading=true;loading++;loader.loadAsync('/api/vehicle/'+encodeURIComponent(wanted)+'.glb').then(gltf=>{
        if(peers.get(id)!==p||p.car!==car||p.target.carModel!==wanted){releaseCar(gltf.scene);return;}
        releaseCar(car.group);Object.assign(car,prepareCarModel(gltf.scene),{modelId:wanted});scene.add(car.group);
      }).catch(()=>{p.carRetry=performance.now()+15000;}).finally(()=>{p.carLoading=false;loading--;});
    }
    p.carPose=p.carPose?blendPose(p.carPose,target,1-Math.exp(-14*dt)):{...target};const pose=p.carPose;car.group.position.set(pose.x-o.x*70,pose.y,pose.z-o.z*70);car.group.rotation.y=pose.yaw;car.group.traverse(mesh=>{mesh.castShadow=false;});
    for(const wheel of car.wheels){wheel.spin.rotation.x=-target.phase/(1.4*wheel.radius);wheel.pivot.rotation.y=wheel.front?target.steer:0;}
  }
  function stop(){send();saveGuest();onDisconnect?.();stopped=true;connection++;clearTimeout(retry);clearInterval(timer);socket?.close();clear();}
  function start(){stopped=false;connect();timer=setInterval(send,100);}
  window.addEventListener('pagehide',stop);window.addEventListener('pageshow',()=>{if(stopped)start();});start();
  document.addEventListener('visibilitychange',()=>{if(document.hidden){send();saveGuest();}});
  return {setIdentity(value){if(identity===value)return;send();saveGuest();onDisconnect?.();identity=value;restoredIdentity=undefined;lastPose=null;guestPose=null;connection++;clearTimeout(retry);socket?.close();clear();connect();},
    update(pose,dt){lastPose=pose;lastUpdate=performance.now();if(welcomed&&identity===null&&pose.active){guestPose=pose;if(lastUpdate-lastGuestSave>2000){lastGuestSave=lastUpdate;saveGuest();}}const o=origin();let index=0;
      for(const [id,p] of peers){
        if(index++<8)loadModel(id,p);
        p.pose=blendPose(p.pose,p.target,1-Math.exp(-14*dt));const s=p.pose,position=new T.Vector3(s.x-o.x*70,s.y,s.z-o.z*70);
        p.avatar.update({...s,position,visible:s.active,dt});updateCar(id,p,dt,o);
        p.label.position.copy(position).add(new T.Vector3(0,1.95,0));const distance=Math.hypot(s.x-pose.x,s.z-pose.z);p.label.visible=s.active&&distance<90;p.label.material.opacity=Math.min(1,Math.max(0,(90-distance)/20));
        const remoteType=s.personalCar?.driving?null:s.vehicleType;
        if(p.vehicle?.type!==remoteType){if(p.vehicle)release(p.vehicle.group);p.vehicle=remoteType?{...createVehicleModel(remoteType),type:remoteType}:null;if(p.vehicle){p.vehicle.group.traverse(o=>{o.castShadow=false;});scene.add(p.vehicle.group);}}
        if(p.vehicle){const v=p.vehicle,offset=s.vehicleType==='bike'?.35:0;v.group.position.set(position.x-Math.sin(s.yaw)*offset,position.y-(s.vehicleType==='bike'?.24:-.2),position.z-Math.cos(s.yaw)*offset);v.group.rotation.y=s.yaw;for(const w of v.wheels)w.spin.rotation.x=-s.crankPhase/(1.4*w.radius);v.pedals.forEach((part,i)=>{const phase=s.crankPhase+i*Math.PI;part.position.y=.5+.17*Math.sin(phase);part.position.z=.05+.17*Math.cos(phase);});}
      }
    },dispose:stop};
}
