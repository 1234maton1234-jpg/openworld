export const PLOT=Object.freeze({width:64,depth:64,height:600,cell:70,version:2});
export const TERRAIN=Object.freeze({seed:734921,version:2,water:0,cell:PLOT.cell});
export const MAX_COORDINATE=Math.floor(2**40/TERRAIN.cell)-32;
export const validCoordinate=v=>Number.isSafeInteger(v)&&Math.abs(v)<=MAX_COORDINATE;
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
export function hash(x,z,salt=0){let n=(Math.imul(x|0,374761393)^Math.imul(z|0,668265263)^TERRAIN.seed^salt)|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function noise(x,z,salt){const ix=Math.floor(x),iz=Math.floor(z),fx=smooth(0,1,x-ix),fz=smooth(0,1,z-iz),a=hash(ix,iz,salt),b=hash(ix+1,iz,salt),c=hash(ix,iz+1,salt),d=hash(ix+1,iz+1,salt);return (a+(b-a)*fx)*(1-fz)+(c+(d-c)*fx)*fz;}
export function riverX(z){return 225+Math.sin(z/250)*42+Math.sin(z/110)*13;}
export function heightAt(x,z){
  const broad=noise(x/360,z/360,11),ridge=Math.pow(Math.max(0,(broad-.35)/.65),1.7)*24;
  const hills=noise(x/140,z/140,29)*5+noise(x/60,z/60,47)*.8;
  let height=3+ridge+hills;
  const clearing=smooth(82,160,Math.max(Math.abs(x),Math.abs(z)));height=4+(height-4)*clearing;
  const cycle=1100,channel=riverX(z),distance=Math.abs(((x-channel+cycle/2)%cycle+cycle)%cycle-cycle/2),width=7+noise(z/70,0,73)*5;
  const bank=smooth(width,width+60+height*5,distance);height=-1.5+(height+1.5)*bank;
  return Math.round(height*1e6)/1e6;
}
const cache=new Map();
export function plotTerrain(x,z){
  const key=x+','+z;if(cache.has(key))return cache.get(key);
  let min=Infinity,max=-Infinity;
  for(let dx=-PLOT.width/2;dx<=PLOT.width/2;dx+=2)for(let dz=-PLOT.width/2;dz<=PLOT.width/2;dz+=2){const y=heightAt(x*PLOT.cell+dx,z*PLOT.cell+dz);min=Math.min(min,y);max=Math.max(max,y);}
  const wet=min<1.15,steep=max-min>7,elevation=Math.ceil((max+.3)*10)/10;
  const result=Object.freeze({buildable:!wet&&!steep,elevation,min,max,relief:max-min,biome:wet?'河流湿地':steep?'山地保护区':elevation>24?'山间台地':elevation>8?'林间缓坡':'河谷草地',reason:wet?'地块涉及河道或滨水保护带，不能领取':steep?'地块高差超过 7 米，请选择更平缓的土地':''});
  if(cache.size>12000)cache.clear();cache.set(key,result);return result;
}
