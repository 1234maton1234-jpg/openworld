import {SIDEWALK_WIDTH,CURB_HEIGHT} from './street-style.mjs';
import {riverbankHeight} from './riverbank.mjs';
import {hash} from './world-noise.mjs';
import {inside,boundaryDistance} from './polygon-land.mjs';
import {cityHeight,roadHeight,riverDistance} from './city-plan.mjs';
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const EMPTY=[];
function index(items,bounds,size){
  const cells=new Map();
  for(const item of items){const [l,b,r,t]=bounds(item);for(let x=Math.floor(l/size);x<=Math.floor(r/size);x++)for(let z=Math.floor(b/size);z<=Math.floor(t/size);z++){const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(item);}}
  return (x,z)=>cells.get(Math.floor(x/size)+','+Math.floor(z/size))||EMPTY;
}
function noise(x,z,salt){
  const ix=Math.floor(x),iz=Math.floor(z),u=smooth(x-ix),v=smooth(z-iz),a=hash(ix,iz,salt),b=hash(ix+1,iz,salt),c=hash(ix,iz+1,salt),d=hash(ix+1,iz+1,salt);
  return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
}
export function createUrbanTerrain(frozen=[],hydrology,config={version:2}){
  const nearbyFrozen=index(frozen,([l,b,r,t])=>[l-1880,b-1880,r+1880,t+1880],560);
  const nearbyRelief=index([...frozen,...(config.reliefFrozen||[])],([l,b,r,t])=>[l-12080,b-12080,r+12080,t+12080],2048);
  let previousLots,previousRoads,nearbyLots,nearbyRoads;
  function weight(x,z){let distance=Infinity;for(const [l,b,r,t] of nearbyFrozen(x,z))distance=Math.min(distance,Math.hypot(Math.max(l-x,0,x-r),Math.max(b-z,0,z-t)));return smooth((distance-80)/1800);}
  const previous=(x,z)=>4+12*noise(x/1600,z/1600,1301)+4*noise(x/700,z/700,1302);
  function natural(x,z){if(config.version>=4)return 4.3;if((config.version||2)<3)return previous(x,z);let distance=Infinity;for(const [l,b,r,t] of nearbyRelief(x,z))distance=Math.min(distance,Math.hypot(Math.max(l-x,0,x-r),Math.max(b-z,0,z-t)));const w=smooth((distance-80)/12000);if(!w)return previous(x,z);const regional=4+64*noise(x/5000,z/5000,1301)+14*noise(x/1800,z/1800,1302)+3*noise(x/900,z/900,1303);return w===1?regional:previous(x,z)*(1-w)+regional*w;}
  function base(x,z){const w=weight(x,z);if(w===1)return natural(x,z);const old=roadHeight(x,z);return w===0?old:old+(natural(x,z)-old)*w;}
  function height(x,z){const w=weight(x,z);if(!w)return cityHeight(x,z,hydrology);const d=hydrology?hydrology.distance(x,z):riverDistance(x,z),h=d<=14&&hydrology?.bedDepth?-hydrology.bedDepth(x,z):-1.5+(natural(x,z)+CURB_HEIGHT+1.5)*smooth((d-14)/24);if(w===1)return h;const old=cityHeight(x,z,hydrology);return old+(h-old)*w;}
  function ground(x,z,lots=EMPTY,legacy=EMPTY,roads=EMPTY){
    const changed=lots!==previousLots||roads!==previousRoads;
    if(lots!==previousLots){previousLots=lots;nearbyLots=index(lots.filter(p=>p.version>=4),p=>[p.cx-p.width/2-18,p.cz-p.depth/2-18,p.cx+p.width/2+18,p.cz+p.depth/2+18],128);}
    if(changed){previousRoads=roads;const segments=roads.flatMap(r=>(r.sections||[r]).flatMap(s=>s.kind!=='crossing'?[s]:Number.isInteger(s.deckStart)&&Number.isInteger(s.deckEnd)?[{...s,points:s.points.slice(0,s.deckStart+1)},{...s,points:s.points.slice(s.deckEnd)}]:[]).flatMap(s=>s.points.slice(1).map((b,i)=>({a:s.points[i],b,width:s.width||r.width}))));for(const lot of lots)if(lot.version>=4&&lot.entrance){const [a,b]=lot.entrance.points;segments.push({a,b,width:6,access:true});}for(const s of segments)s.blend=s.access?18:Math.min(240,Math.max(24,(Math.max(s.a[1],s.b[1])+2)*3));nearbyRoads=index(segments,({a,b,width,blend})=>{const pad=width/2+SIDEWALK_WIDTH+blend;return [Math.min(a[0],b[0])-pad,Math.min(a[2],b[2])-pad,Math.max(a[0],b[0])+pad,Math.max(a[2],b[2])+pad];},128);}
    const bankDistance=hydrology?hydrology.distance(x,z):riverDistance(x,z);
    let h=bankDistance>14?riverbankHeight(bankDistance,base(x,z)+CURB_HEIGHT):height(x,z),sum=0,total=0,strongest=0;
    for(const p of nearbyLots(x,z)){const d=p.polygon?(inside(p.polygon,[x,z])?0:boundaryDistance(p.polygon,[x,z])):Math.max(Math.abs(x-p.cx)-p.width/2,Math.abs(z-p.cz)-p.depth/2,0);if(d===0)return p.elevation;if(d<18){const w=1-smooth(d/18);sum+=p.elevation*w;total+=w;strongest=Math.max(strongest,w);}}
    if(total)h+=(sum/total-h)*strongest;
    let ceiling=Infinity,raise=0,cut=0;
    for(const {a,b,width,access,blend} of nearbyRoads(x,z)){const dx=b[0]-a[0],dz=b[2]-a[2],length=dx*dx+dz*dz;if(length<1e-8)continue;const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/length)),distance=Math.hypot(x-a[0]-t*dx,z-a[2]-t*dz),d=distance-width/2-(access?2:SIDEWALK_WIDTH),y=a[1]+t*(b[1]-a[1])-.035,w=(1-smooth(d/blend))*(access?1:smooth((bankDistance-14)/28)),delta=(y-h)*w;raise=Math.max(raise,delta);cut=Math.min(cut,delta);if(d<=0&&w===1)ceiling=Math.min(ceiling,y);}
    h+=raise+cut;
    h=Math.min(h,ceiling);
    for(const p of legacy){const d=Math.max(Math.abs(x-p.cx)-p.width/2,Math.abs(z-p.cz)-p.depth/2,0);if(d<8)h+=(p.elevation-h)*(1-smooth(d/8));}
    return h;
  }
  return {base,height,ground};
}
