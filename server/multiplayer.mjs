import {WebSocketServer,WebSocket} from 'ws';
import {allowedOrigin} from './origins.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {playerPose,PLAYER_RADIUS,PLAYER_LIMIT} from '../shared/player-state.mjs';
import {createCarRides} from './car-rides.mjs';
import {carSeats,stockCarSeats} from '../shared/car-seats.mjs';
import {createPlayerPositions} from './player-position.mjs';

export function installMultiplayer(server,store,config){
  const wss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false}),peers=new Map(),pending=new Set();let closed=false;
  const rides=createCarRides(peers);
  function vehicleSeats(user,type='car'){if(type==='car'&&!user?.vehicle)return stockCarSeats();try{return carSeats(JSON.parse((type==='car'?user?.vehicleMetrics:user?.models?.[type]?.metrics)||'{}').vehicleSeats,type);}catch{return carSeats();}}
  function applyVehicle(peer,user){const type=peer.pose?.personalCar?.type||'car';peer.models=user?.models||{};peer.vehicle=type==='car'?user?.vehicle||null:peer.models[type]?.id||null;peer.seats=vehicleSeats(user,type);peer.vehicleUser=user;}
  function selectVehicle(peer){applyVehicle(peer,peer.vehicleUser);}
  const positions=createPlayerPositions(store.db),writes=new Map();
  function save(peer){
    if(!peer.userId||!peer.lastPosition||!peer.dirty)return Promise.resolve();
    const pose={...peer.lastPosition};peer.dirty=false;
    const write=(writes.get(peer.userId)||Promise.resolve()).then(async()=>{await (await positions).save(peer.userId,pose);}).catch(()=>{peer.dirty=true;console.error('Player position save failed');});
    writes.set(peer.userId,write);write.finally(()=>{if(writes.get(peer.userId)===write)writes.delete(peer.userId);});return write;
  }
  const token=req=>(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('town_session='))?.slice(13);
  async function identity(hash){const user=hash?await store.db.prepare('SELECT u.id,u.login,a.id AS avatar,v.id AS vehicle,v.metrics AS vehicleMetrics FROM sessions s JOIN users u ON s.user=u.id LEFT JOIN avatars a ON a.owner=u.id LEFT JOIN vehicles v ON v.owner=u.id WHERE s.hash=? AND s.expires>?').get(hash,Date.now()):null;if(user)user.models=Object.fromEntries((await store.db.prepare('SELECT category,id,metrics FROM extra_vehicles WHERE owner=?').all(user.id)).map(v=>[v.category,v]));return user;}
  function send(ws,value){if(ws.readyState!==WebSocket.OPEN)return;if(ws.bufferedAmount>131072){ws.terminate();return;}ws.send(JSON.stringify(value));}
  async function upgrade(req,socket,head){
    socket.on('error',()=>{});
    if(closed||req.url!=='/realtime'||!allowedOrigin(config,req.headers.origin)||peers.size+pending.size>=512){const status=closed||peers.size+pending.size>=512?'503 Service Unavailable':'403 Forbidden';socket.end('HTTP/1.1 '+status+'\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');return;}
    const ip=req.socket.remoteAddress;
    pending.add(socket);socket.setTimeout(10000,()=>socket.destroy());
    try{
      const raw=token(req),hash=raw?createHash('sha256').update(raw).digest('hex'):null,user=await identity(hash);
      let resume=null;if(user){await writes.get(user.id);resume=await (await positions).load(user.id);if(writes.has(user.id)){await writes.get(user.id);resume=await (await positions).load(user.id);}}
      if(closed||socket.destroyed)return;
      socket.setTimeout(0);
      wss.handleUpgrade(req,socket,head,ws=>{
        const id=randomUUID(),peer={id,ip,hash:user?hash:null,userId:user?.id,name:user?.login||'访客·'+id.slice(0,6),avatar:user?.avatar||null,pose:null,alive:true,updated:Date.now(),window:Date.now(),messages:0,checking:false};
        if(user)for(const [other,p] of peers)if(p.userId===user.id){resume=p.lastPosition||resume;void save(p);peers.delete(other);other.close(4001,'Account connected elsewhere');}
        applyVehicle(peer,user);peers.set(ws,peer);send(ws,{type:'welcome',id,name:peer.name,userId:user?.id||null,position:resume});
        ws.on('error',()=>{});ws.on('pong',()=>{peer.alive=true;});ws.on('close',()=>{if(peers.has(ws)){void save(peer);peers.delete(ws);}});
        ws.on('message',(bytes,binary)=>{
          if(!peers.has(ws))return;const now=Date.now();if(now-peer.window>=1000){peer.window=now;peer.messages=0;}
          if(binary||++peer.messages>30){ws.close(1008,'Invalid presence traffic');return;}
          try{const message=JSON.parse(bytes);if(message.type==='ping'){if(Number.isSafeInteger(message.id)&&message.id>=0)send(ws,{type:'pong',id:message.id});return;}if(message.type==='ride-enter'){try{send(ws,{type:'ride',ride:rides.enter(peer,message.owner)});}catch(error){send(ws,{type:'ride-error',error:error.message});}return;}if(message.type==='ride-exit'){const position=rides.leave(peer);if(position)send(ws,{type:'ride-end',position});return;}if(message.type!=='pose')return;const pose=playerPose(message.pose);if(!pose){ws.close(1008,'Invalid pose');return;}if(peer.ride){peer.updated=now;return;}const oldCar=peer.pose?.personalCar;if(pose.personalCar&&oldCar)peer.carSpeed=Math.hypot(pose.personalCar.x-oldCar.x,pose.personalCar.y-oldCar.y,pose.personalCar.z-oldCar.z)/Math.max(.01,(now-peer.updated)/1000);else peer.carSpeed=0;if(pose.personalCar&&!peer.pose?.personalCar&&peer.hash&&!peer.checking&&now-(peer.vehicleChecked||0)>5000){peer.vehicleChecked=now;peer.checking=true;identity(peer.hash).then(user=>{if(user){applyVehicle(peer,user);}else ws.close(4003,'Session expired');}).catch(()=>{}).finally(()=>{peer.checking=false;});}peer.pose=pose;selectVehicle(peer);peer.updated=now;if(pose.active){peer.lastPosition=pose;peer.dirty=true;}}catch{ws.close(1008,'Invalid JSON');}
        });
      });
    }catch{socket.destroy();}finally{pending.delete(socket);}
  }
  server.on('upgrade',upgrade);
  const tick=setInterval(()=>{
    const cells=new Map(),now=Date.now();
    for(const [ws,p] of peers)if(p.ride){const ride=rides.update(p);if(ride)send(ws,{type:'ride',ride});else{const position=rides.leave(p);send(ws,{type:'ride-end',position});}}
    for(const p of peers.values())if(p.pose&&now-p.updated<45000)for(const location of [p.pose.active?p.pose:null,p.pose.personalCar].filter(Boolean)){const key=Math.floor(location.x/PLAYER_RADIUS)+','+Math.floor(location.z/PLAYER_RADIUS);if(!cells.has(key))cells.set(key,new Set());cells.get(key).add(p);}
    for(const [ws,self] of peers){
      if(!self.pose)continue;const candidates=new Map(),cx=Math.floor(self.pose.x/PLAYER_RADIUS),cz=Math.floor(self.pose.z/PLAYER_RADIUS);
      for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const p of cells.get((cx+dx)+','+(cz+dz))||[]){const car=p.pose.personalCar,d=Math.min(p.pose.active?Math.hypot(p.pose.x-self.pose.x,p.pose.z-self.pose.z):Infinity,car?Math.hypot(car.x-self.pose.x,car.z-self.pose.z):Infinity);if(p!==self&&d<=PLAYER_RADIUS)candidates.set(p.id,{p,d});}
      send(ws,{type:'snapshot',players:[...candidates.values()].sort((a,b)=>a.d-b.d).slice(0,PLAYER_LIMIT).map(({p})=>({...p.pose,id:p.id,name:p.name,avatar:p.avatar,carModel:p.vehicle,carSeats:p.seats,ride:p.ride||null,moving:p.pose.moving&&now-p.updated<500}))});
    }
  },100);tick.unref();
  const heartbeat=setInterval(()=>{
    for(const [ws,p] of peers){
      if(!p.alive){ws.terminate();continue;}p.alive=false;ws.ping();
      if(p.hash&&!p.checking){p.checking=true;identity(p.hash).then(user=>{if(!user)ws.close(4003,'Session expired');else{p.name=user.login;p.avatar=user.avatar||null;applyVehicle(p,user);}}).catch(()=>ws.close(1011,'Identity unavailable')).finally(()=>p.checking=false);}
    }
  },15000);heartbeat.unref();
  const checkpoint=setInterval(()=>{for(const peer of peers.values())void save(peer);},5000);checkpoint.unref();
  return {async close(){closed=true;clearInterval(tick);clearInterval(heartbeat);clearInterval(checkpoint);server.off('upgrade',upgrade);for(const socket of pending)socket.destroy();for(const peer of peers.values())void save(peer);for(const ws of wss.clients)ws.terminate();peers.clear();await Promise.all([...writes.values()]);await positions;return new Promise(r=>wss.close(r));}};
}
