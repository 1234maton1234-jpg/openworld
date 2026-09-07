export function closeReason(code){return ({1000:'连接已关闭',1001:'服务器或页面离开',1006:'连接中断（浏览器未提供具体原因）',1008:'连接被策略拒绝',1011:'服务器暂时不可用',1012:'服务器正在重启',1013:'服务器繁忙',4000:'连接或心跳超时',4001:'账号已在其他页面登录',4003:'登录已过期，请重新登录'})[code]||`连接关闭（${code}）`;}
export function createSocketHealth(ws,{update,now=()=>performance.now(),hidden=()=>document.hidden}){
 let welcomed=false,disposed=false,pending=null,sequence=0,last=0,started=now(),wasHidden=false;
 function ping(){const time=now();pending={id:++sequence,time};last=time;ws.send(JSON.stringify({type:'ping',id:sequence}));}
 function tick(){if(disposed)return;const time=now();if(hidden()){wasHidden=true;return;}if(wasHidden){wasHidden=false;pending=null;started=time;last=time-5000;}
  if(!welcomed){if(time-started>=10000){update({state:'offline',reason:'连接或握手超时',rtt:null});ws.close(4000,'Connection timeout');dispose();}return;}
  if(pending&&time-pending.time>=10000){update({state:'offline',reason:'心跳超时，正在重连',rtt:null});ws.close(4000,'Heartbeat timeout');dispose();return;}
  if(!pending&&time-last>=5000&&ws.readyState===1)ping();
 }
 const timer=setInterval(tick,1000);
 function dispose(){disposed=true;clearInterval(timer);pending=null;}
 return {welcome(){if(disposed||welcomed)return;welcomed=true;update({state:'online',rtt:null,reason:''});ping();},pong(message){if(disposed||!pending||message.id!==pending.id)return;const rtt=Math.max(0,Math.round(now()-pending.time));pending=null;update({state:'online',rtt,reason:''});},dispose};
}
