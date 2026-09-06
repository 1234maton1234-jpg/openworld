import {hash,riverX} from './terrain.mjs';
const CELL=1400,TILE=128,smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const oldDistance=(x,z)=>{const d=x-riverX(z);return Math.abs(d-Math.round(d/1100)*1100);};
export function createHydrology(frozen=[]){
  const edges=new Map(),tiles=new Map();
  function node(x,z){return [x*CELL+(hash(x,z,900)-.5)*520,z*CELL+(hash(x,z,901)-.5)*520];}
  function edge(x,z){const key=x+','+z;if(edges.has(key))return edges.get(key);const pick=Math.floor(hash(x,z,903)*3),a=node(x,z),b=node(x-(pick!==1?1:0),z-(pick!==0?1:0)),dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),bend=(hash(x,z,904)-.5)*520,width=12+hash(x,z,905)*12;
    const points=[];for(let i=0;i<=48;i++){const t=i/48,curve=Math.sin(Math.PI*t)**2*bend+Math.sin(2*Math.PI*t)*Math.sin(Math.PI*t)**2*70;points.push([a[0]+dx*t-dz/length*curve,a[1]+dz*t+dx/length*curve]);}
    const lines=points.slice(1).map((p,i)=>({a:points[i],b:p,width,riverId:key,index:i}));if(edges.size>2048)edges.clear();edges.set(key,lines);return lines;
  }
  function segments(x,z){const tx=Math.floor(x/TILE),tz=Math.floor(z/TILE),key=tx+','+tz;if(tiles.has(key))return tiles.get(key);const mx=Math.floor(x/CELL),mz=Math.floor(z/CELL),lines=[];
    for(let i=mx-2;i<=mx+2;i++)for(let j=mz-2;j<=mz+2;j++)for(const line of edge(i,j)){const {a,b}=line;if(Math.max(a[0],b[0])>=tx*TILE-100&&Math.min(a[0],b[0])<=(tx+1)*TILE+100&&Math.max(a[1],b[1])>=tz*TILE-100&&Math.min(a[1],b[1])<=(tz+1)*TILE+100)lines.push(line);}
    if(tiles.size>4096)tiles.clear();tiles.set(key,lines);return lines;
  }
  function network(x,z){let distance=200;for(const {a,b,width} of segments(x,z)){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));distance=Math.min(distance,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)*14/width);}return distance;}
  function preservation(x,z){let weight=0;for(const [l,b,r,t] of frozen){const d=Math.hypot(Math.max(l-x,0,x-r),Math.max(b-z,0,z-t));if(!d)return 1;weight=Math.max(weight,1-smooth(d/280));}return weight;}
  return {distance(x,z){const weight=preservation(x,z);if(weight===1)return oldDistance(x,z);const d=network(x,z);return weight?Math.min(60,oldDistance(x,z))*weight+Math.min(60,d)*(1-weight):d;},segments,network};
}
