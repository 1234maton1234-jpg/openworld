import {WORLD_SEED} from './world-noise.mjs';
import {hash as terrainHash} from './terrain.mjs';
import {createHydrology} from './hydrology.mjs';
const BASIN=6400,REACH=2400,TILE=256,smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export const coastAt=x=>40000+700*Math.sin(x/3900)+330*Math.sin(x/1700+.8)+120*Math.sin(x/670);
export function createCoastalHydrology({frozen=[],previous={frozen:[]},seed=WORLD_SEED}={}){
  const hash=(x,z,salt)=>terrainHash(x,z,salt^seed);
  const old=createHydrology(previous.frozen),paths=new Map(),tiles=new Map();
  const center=(basin,z)=>basin*BASIN+1050+620*Math.sin(z/2800+hash(basin,0,1601)*6)+180*Math.sin(z/950+basin*.7);
  function main(basin,z){const x=center(basin,z),mouth=smooth((z-coastAt(x)+2400)/2400);return {x,width:3.5*(100+45*hash(basin,0,1602)+35*Math.sin(z/4200+basin)**2+mouth*190)};}
  function path(basin,reach,kind){const id=`coastal:${basin}:${reach}:${kind}`;if(paths.has(id))return paths.get(id);const points=[];
    for(let i=0;i<=48;i++){const t=i/48,z=reach*REACH+t*REACH,m=main(basin,z);
      if(kind==='main')points.push({p:[m.x,z],width:m.width});
      else{const side=kind==='east'?1:-1,seed=hash(basin,reach,kind==='east'?1603:1604),joinZ=(reach+.72+seed*.26)*REACH,pz=joinZ-(1300+seed*650)*(1-t),px=center(basin,pz)+side*((1700+seed*650)*(1-t)+(120+seed*220)*Math.sin(Math.PI*t)**2);points.push({p:[px,pz],width:3.5*(14+(15+seed*10)*t)});}
    }
    const lines=points.slice(1).map((p,i)=>({a:points[i].p,b:p.p,width:(points[i].width+p.width)/2,riverId:id,index:i,kind}));if(paths.size>2048)paths.clear();paths.set(id,lines);return lines;
  }
  function segments(x,z){const tx=Math.floor(x/TILE),tz=Math.floor(z/TILE),id=tx+','+tz;if(tiles.has(id))return tiles.get(id);const basin=Math.round((x-1050)/BASIN),reach=Math.floor(z/REACH),lines=[];
    for(let b=basin-1;b<=basin+1;b++)for(let r=reach-1;r<=reach+1;r++)for(const kind of ['main','east','west'])for(const line of path(b,r,kind)){const pad=line.width+180;if(Math.max(...[line.a[0],line.b[0]])<tx*TILE-pad||Math.min(line.a[0],line.b[0])>(tx+1)*TILE+pad||Math.max(line.a[1],line.b[1])<tz*TILE-pad||Math.min(line.a[1],line.b[1])>(tz+1)*TILE+pad)continue;if((line.a[1]+line.b[1])/2>coastAt((line.a[0]+line.b[0])/2)+300)continue;lines.push(line);}
    if(tiles.size>4096)tiles.clear();tiles.set(id,lines);return lines;
  }
  const coastDistance=(x,z)=>coastAt(x)-z;
  function natural(x,z){let d=Math.min(200,14+coastDistance(x,z));for(const line of segments(x,z)){const dx=line.b[0]-line.a[0],dz=line.b[1]-line.a[1],t=Math.max(0,Math.min(1,((x-line.a[0])*dx+(z-line.a[1])*dz)/(dx*dx+dz*dz)));d=Math.min(d,14+Math.hypot(x-line.a[0]-t*dx,z-line.a[1]-t*dz)-line.width);}return d;}
  function preservation(x,z){let d=Infinity;for(const [l,b,r,t] of frozen){if(x<l-1300||x>r+1300||z<b-1300||z>t+1300)continue;d=Math.min(d,Math.hypot(Math.max(l-x,0,x-r),Math.max(b-z,0,z-t)));}return 1-smooth((d-100)/1200);}
  function bedDepth(x,z){let depth=Math.max(1.5,Math.min(36,-coastDistance(x,z)*.035));for(const line of segments(x,z)){const dx=line.b[0]-line.a[0],dz=line.b[1]-line.a[1],t=Math.max(0,Math.min(1,((x-line.a[0])*dx+(z-line.a[1])*dz)/(dx*dx+dz*dz))),d=Math.hypot(x-line.a[0]-t*dx,z-line.a[1]-t*dz);depth=Math.max(depth,1.5+(line.kind==='main'?Math.min(14,line.width*.045):2)*smooth((line.width-d)/Math.max(12,line.width*.55)));}return 1.5+(depth-1.5)*(1-preservation(x,z));}
  return {version:3,coastDistance,main,bedDepth,segments(x,z){return preservation(x,z)===1?old.segments(x,z):segments(x,z);},distance(x,z){const w=preservation(x,z);if(w===1)return old.distance(x,z);const d=natural(x,z);return w?Math.min(100,old.distance(x,z))*w+Math.min(100,d)*(1-w):d;},oceanDepth(x,z){return Math.max(0,Math.min(36,-coastDistance(x,z)*.035));}};
}
export const createWorldHydrology=config=>config?.version===3?createCoastalHydrology(config):createHydrology(config?.frozen||[]);
