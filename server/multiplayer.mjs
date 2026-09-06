import {WebSocketServer,WebSocket} from 'ws';
import {randomUUID,createHash} from 'node:crypto';
import {playerPose,PLAYER_RADIUS,PLAYER_LIMIT} from '../shared/player-state.mjs';

export function installMultiplayer(server,store,config){
  const wss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false}),peers=new Map(),pending=new Set();let closed=false;
  const token=req=>(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('town_session='))?.slice(13);
  async function identity(hash){return hash?store.db.prepare('SELECT u.id,u.login,a.id AS avatar FROM sessions s JOIN users u ON s.user=u.id LEFT JOIN avatars a ON a.owner=u.id WHERE s.hash=? AND s.expires>?').get(hash,Date.now()):null;}
  function send(ws,value){if(ws.readyState!==WebSocket.OPEN)return;if(ws.bufferedAmount>131072){ws.terminate();return;}ws.send(JSON.stringify(value));}
  async function upgrade(req,socket,head){
    socket.on('error',()=>{});
    if(closed||req.url!=='/realtime'||req.headers.origin!==config.url||peers.size+pending.size>=512){socket.destroy();return;}
    const ip=req.socket.remoteAddress;
    pending.add(socket);socket.setTimeout(10000,()=>socket.destroy());
    try{
      const raw=token(req),hash=raw?createHash('sha256').update(raw).digest('hex'):null,user=await identity(hash);
      if(closed||socket.destroyed)return;
      socket.setTimeout(0);
      wss.handleUpgrade(req,socket,head,ws=>{
        const id=randomUUID(),peer={id,ip,hash:user?hash:null,userId:user?.id,name:user?.login||'访客·'+id.slice(0,6),avatar:user?.avatar||null,pose:null,alive:true,updated:Date.now(),window:Date.now(),messages:0,checking:false};
        if(user)for(const [other,p] of peers)if(p.userId===user.id){peers.delete(other);other.close(4001,'Account connected elsewhere');}
        peers.set(ws,peer);send(ws,{type:'welcome',id,name:peer.name});
        ws.on('error',()=>{});ws.on('pong',()=>{peer.alive=true;});ws.on('close',()=>peers.delete(ws));
        ws.on('message',(bytes,binary)=>{
          if(!peers.has(ws))return;const now=Date.now();if(now-peer.window>=1000){peer.window=now;peer.messages=0;}
          if(binary||++peer.messages>30){ws.close(1008,'Invalid presence traffic');return;}
          try{const message=JSON.parse(bytes);if(message.type!=='pose')return;const pose=playerPose(message.pose);if(!pose){ws.close(1008,'Invalid pose');return;}peer.pose=pose;peer.updated=now;}catch{ws.close(1008,'Invalid JSON');}
        });
      });
    }catch{socket.destroy();}finally{pending.delete(socket);}
  }
  server.on('upgrade',upgrade);
  const tick=setInterval(()=>{
    const cells=new Map(),now=Date.now();
    for(const p of peers.values())if(p.pose?.active&&now-p.updated<45000){const key=Math.floor(p.pose.x/PLAYER_RADIUS)+','+Math.floor(p.pose.z/PLAYER_RADIUS);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);}
    for(const [ws,self] of peers){
      if(!self.pose)continue;const candidates=[],cx=Math.floor(self.pose.x/PLAYER_RADIUS),cz=Math.floor(self.pose.z/PLAYER_RADIUS);
      for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const p of cells.get((cx+dx)+','+(cz+dz))||[]){const d=Math.hypot(p.pose.x-self.pose.x,p.pose.z-self.pose.z);if(p!==self&&d<=PLAYER_RADIUS)candidates.push({p,d});}
      send(ws,{type:'snapshot',players:candidates.sort((a,b)=>a.d-b.d).slice(0,PLAYER_LIMIT).map(({p})=>({...p.pose,id:p.id,name:p.name,avatar:p.avatar,moving:p.pose.moving&&now-p.updated<500}))});
    }
  },100);tick.unref();
  const heartbeat=setInterval(()=>{
    for(const [ws,p] of peers){
      if(!p.alive){ws.terminate();continue;}p.alive=false;ws.ping();
      if(p.hash&&!p.checking){p.checking=true;identity(p.hash).then(user=>{if(!user)ws.close(4003,'Session expired');else{p.name=user.login;p.avatar=user.avatar||null;}}).catch(()=>ws.close(1011,'Identity unavailable')).finally(()=>p.checking=false);}
    }
  },15000);heartbeat.unref();
  return {close(){closed=true;clearInterval(tick);clearInterval(heartbeat);server.off('upgrade',upgrade);for(const socket of pending)socket.destroy();for(const ws of wss.clients)ws.terminate();peers.clear();return new Promise(r=>wss.close(r));}};
}
