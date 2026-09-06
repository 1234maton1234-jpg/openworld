export function worldHour(timestamp){return ((timestamp%3600000+3600000)%3600000)/150000;}
export function createWorldClock(){
  let base=Date.now(),anchor=performance.now(),busy=false;
  async function sync(){if(document.hidden||busy)return;busy=true;const start=performance.now();try{const response=await fetch('/health',{cache:'no-store',signal:AbortSignal.timeout(5000)}),data=await response.json();if(response.ok&&Number.isFinite(data.serverTime)){anchor=performance.now();base=data.serverTime+(anchor-start)/2;}}catch{}finally{busy=false;}}
  sync();setInterval(sync,60000);document.addEventListener('visibilitychange',sync);
  return ()=>worldHour(base+performance.now()-anchor);
}
