import {hash,riverX,PLOT} from './terrain.mjs';
import {inside} from './polygon-land.mjs';
export const CITY=Object.freeze({version:1,terrainVersion:1,block:280,regionBlocks:2,roadWidth:12,mainWidth:16});
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export const axis=n=>n*280+16*Math.sin(n*.73);
export function blockAt(v){let n=Math.floor(v/280);while(v<axis(n))n--;while(v>=axis(n+1))n++;return n;}
export const regionAt=(x,z)=>({x:Math.floor(blockAt(x)/2),z:Math.floor(blockAt(z)/2)});
const base=(x,z)=>4+.3*Math.sin(x/1300)*Math.sin(z/1100)+.2*Math.sin(x/2400)+.2*Math.sin(z/1900);
export function roadHeight(x,z){return base(x,z);}
export function districtHeight(x,z){
  const bx=blockAt(x),bz=blockAt(z),left=axis(bx),right=axis(bx+1),bottom=axis(bz),top=axis(bz+1),d=Math.min(x-left,right-x,z-bottom,top-z);
  const h=base(x,z),level=base((left+right)/2,(bottom+top)/2);return h+(level-h)*smooth(d/30);
}
export function riverDistance(x,z){const d=x-riverX(z);return Math.abs(d-Math.round(d/1100)*1100);}
export function cityHeight(x,z,hydrology){const h=districtHeight(x,z),d=hydrology?hydrology.distance(x,z):riverDistance(x,z);return -1.5+(h+1.5)*smooth((d-14)/24);}
export function groundHeight(x,z,legacy=[],hydrology){let h=cityHeight(x,z,hydrology);for(const p of legacy){const d=Math.max(Math.abs(x-p.cx)-p.width/2,Math.abs(z-p.cz)-p.depth/2,0);if(d<8)h=h+(p.elevation-h)*(1-smooth(d/8));}return h;}
export const overlaps=(a,b,padding=0)=>Math.abs(a.cx-b.cx)<(a.width+b.width)/2+padding&&Math.abs(a.cz-b.cz)<(a.depth+b.depth)/2+padding;
export function lotAtPoint(lots,x,z){return lots.find(l=>l.polygon?inside(l.polygon,[x,z]):Math.abs(x-l.cx)<=l.width/2&&Math.abs(z-l.cz)<=l.depth/2);}
function road(bx,bz,vertical,protectedLots,hydrology){
  const x=axis(bx),z=axis(bz),end=vertical?axis(bz+1):axis(bx+1),length=end-(vertical?z:x),segments=Math.ceil(length/8),points=[];
  for(let i=0;i<=segments;i++){let px=vertical?x:(i===segments?end:x+length*i/segments),pz=vertical?(i===segments?end:z+length*i/segments):z;
    for(const p of protectedLots){const across=vertical?Math.abs(x-p.cx):Math.abs(z-p.cz),along=vertical?Math.abs(pz-p.cz):Math.abs(px-p.cx);if(across<44&&along<110){const offset=58*(1-smooth(Math.max(0,along-44)/66));if(vertical)px-=offset;else pz-=offset;}}
    points.push([px,roadHeight(px,pz)+.035,pz]);}
  return {id:`${vertical?'v':'h'}:${bx}:${bz}`,width:(vertical?bx:bz)%2===0?CITY.mainWidth:CITY.roadWidth,points,bridge:points.some(p=>(hydrology?hydrology.distance(p[0],p[2]):riverDistance(p[0],p[2]))<38)};
}
export function generateRegion(rx,rz,protectedLots=[],hydrology){
  const roads=[],lots=[],parks=[];
  for(let i=0;i<=2;i++)for(let j=0;j<2;j++){roads.push(road(rx*2+i,rz*2+j,true,protectedLots,hydrology),road(rx*2+j,rz*2+i,false,protectedLots,hydrology));}
  for(let i=0;i<2;i++)for(let j=0;j<2;j++){
    const bx=rx*2+i,bz=rz*2+j,left=axis(bx),right=axis(bx+1),bottom=axis(bz),top=axis(bz+1),level=base((left+right)/2,(bottom+top)/2);
    for(let side=0;side<2;side++)for(let slot=0;slot<2;slot++){
      const cx=side?right-44:left+44,cz=slot?top-72:bottom+72,lot={x:rx*8+i*4+side*2+1,z:rz*8+j*4+slot*2+1,cx,cz,width:64,depth:64,elevation:level,version:CITY.version};
      const civic=Math.abs(cx)<210&&Math.abs(cz)<210,park=hash(bx,bz,side*17+slot+601)<.12;
      let min=Infinity,max=-Infinity,wet=false;
      for(let dx=-36;dx<=36;dx+=4)for(let dz=-36;dz<=36;dz+=4){const h=cityHeight(cx+dx,cz+dz,hydrology);min=Math.min(min,h);max=Math.max(max,h);if((hydrology?hydrology.distance(cx+dx,cz+dz):riverDistance(cx+dx,cz+dz))<42)wet=true;}
      if(civic||protectedLots.some(p=>overlaps(lot,p,12)))continue;
      if(wet||park){parks.push({cx,cz,width:64,depth:64,kind:wet?'riverbank':'garden'});continue;}
      lot.relief=max-min;lot.min=min;lot.max=max;lot.biome='平缓城市街区';lot.buildable=lot.relief<=1;
      const edgeX=side?cx+32:cx-32,roadX=side?right:left;
      lot.entrance={roadId:`v:${side?bx+1:bx}:${bz}`,points:[[edgeX,level+.04,cz],[roadX,roadHeight(roadX,cz)+.04,cz]]};
      if(lot.buildable)lots.push(lot);
    }
  }
  return {x:rx,z:rz,version:CITY.version,terrainVersion:CITY.terrainVersion,bounds:[axis(rx*2),axis(rz*2),axis(rx*2+2),axis(rz*2+2)],roads,lots,parks};
}
export function validateRegion(plan){
  if(!plan.roads.length)return plan.lots.length?['lot-access']:[];
  const errors=[],ids=new Set(),roads=new Map(plan.roads.map(r=>[r.id,r]));
  for(const road of plan.roads)for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i];if(Math.abs(b[1]-a[1])/Math.hypot(b[0]-a[0],b[2]-a[2])>.05)errors.push('road-grade');}
  const graph=new Map();for(const r of plan.roads){const a=r.points[0],b=r.points.at(-1),ka=`${a[0]},${a[2]}`,kb=`${b[0]},${b[2]}`;if(!graph.has(ka))graph.set(ka,[]);if(!graph.has(kb))graph.set(kb,[]);graph.get(ka).push(kb);graph.get(kb).push(ka);}
  const seen=new Set(),queue=[graph.keys().next().value];while(queue.length){const k=queue.pop();if(seen.has(k))continue;seen.add(k);queue.push(...(graph.get(k)||[]));}if(seen.size!==graph.size)errors.push('road-disconnected');
  for(const lot of plan.lots){const id=lot.x+','+lot.z;if(ids.has(id))errors.push('duplicate-lot');ids.add(id);if(lot.relief>1||!Number.isFinite(lot.elevation))errors.push('lot-grade');
    if(!roads.has(lot.entrance?.roadId))errors.push('lot-access');else{const [a,b]=lot.entrance.points;if(Math.abs(a[1]-b[1])/Math.hypot(a[0]-b[0],a[2]-b[2])>.05)errors.push('access-grade');
      const points=roads.get(lot.entrance.roadId).points;let distance=Infinity;for(let i=1;i<points.length;i++){const p=points[i-1],q=points[i],dx=q[0]-p[0],dz=q[2]-p[2],t=Math.max(0,Math.min(1,((b[0]-p[0])*dx+(b[2]-p[2])*dz)/(dx*dx+dz*dz)));distance=Math.min(distance,Math.hypot(b[0]-p[0]-t*dx,b[2]-p[2]-t*dz));}if(distance>.05)errors.push('access-disconnected');
    }
    const [left,bottom,right,top]=plan.bounds;if(lot.cx-32<left+6||lot.cx+32>right-6||lot.cz-32<bottom+6||lot.cz+32>top-6)errors.push('lot-boundary');
    for(const other of plan.lots)if(lot!==other&&overlaps(lot,other,6))errors.push('lot-overlap');
  }
  return [...new Set(errors)];
}
