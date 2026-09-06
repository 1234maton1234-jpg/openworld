import {generateNaturalRegion} from './natural-plan.mjs';
import {overlaps,riverDistance} from './city-plan.mjs';
import {createUrbanTerrain} from './urban-terrain.mjs';
import {RIVER_RESERVE} from './construction-layout.mjs';

export function segmentHitsLot(a,b,lot,padding=0){
  let lo=0,hi=1;
  for(const [axis,center,half] of [[0,lot.cx,lot.width/2+padding],[2,lot.cz,lot.depth/2+padding]]){
    const d=b[axis]-a[axis],v=a[axis]-center;
    if(Math.abs(d)<1e-9){if(Math.abs(v)>half)return false;continue;}
    const t1=(-half-v)/d,t2=(half-v)/d;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));if(lo>hi)return false;
  }
  return true;
}
function nearest(road,x,z){
  let best;
  for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[2]-a[2],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz))),px=a[0]+t*dx,pz=a[2]+t*dz,d=Math.hypot(x-px,z-pz);if(!best||d<best.d)best={x:px,z:pz,y:a[1]+t*(b[1]-a[1]),d};}
  return best;
}
export function generateUrbanRegion(rx,rz,legacy=[],hydrology,field=createUrbanTerrain([],hydrology),options={}){
  const plan=generateNaturalRegion(rx,rz,legacy,hydrology),[left,bottom,right,top]=plan.bounds,lots=[];
  plan.version=options.version||4;plan.terrainVersion=2;
  plan.roads=options.roads||plan.roads.map(r=>({...r,points:r.points.map(([x,y,z])=>[x,field.base(x,z)+.035,z])}));
  const corridors=(options.obstacles||plan.roads).map(r=>({...r,clearance:Math.max(r.width,...(r.sections||[]).filter(s=>s.kind==='crossing').map(s=>s.width))/2+6}));
  const blocked=lot=>corridors.some(r=>r.points.slice(1).some((b,i)=>segmentHitsLot(r.points[i],b,lot,r.clearance)));
  function candidate(road,cx,cz){
    if(lots.length>=64||cx-32<left+6||cx+32>right-6||cz-32<bottom+6||cz+32>top-6)return;
    const lot={cx,cz,width:64,depth:64,version:plan.version};
    if([...lots,...legacy].some(p=>overlaps(lot,p,8))||blocked(lot))return;
    let min=Infinity,max=-Infinity;
    for(let x=-32;x<=32;x+=8)for(let z=-32;z<=32;z+=8){if((hydrology?hydrology.distance(cx+x,cz+z):riverDistance(cx+x,cz+z))<(hydrology?.version===3?RIVER_RESERVE:48))return;const h=field.height(cx+x,cz+z);min=Math.min(min,h);max=Math.max(max,h);}
    if(min<3||max-min>1)return;
    const n=nearest(road,cx,cz),dx=n.x-cx,dz=n.z-cz,t=32/Math.max(Math.abs(dx),Math.abs(dz));if(t>=1)return;
    if(plan.version>=5&&hydrology.distance(n.x,n.z)<84)return;
    const ex=cx+dx*t,ez=cz+dz*t,length=Math.hypot(n.x-ex,n.z-ez),elevation=Math.max(n.y-.03*length,Math.min(n.y+.03*length,(min+max)/2));
    if(Math.max(Math.abs(elevation-min),Math.abs(elevation-max))>.8)return;
    const entrance={roadId:road.id,points:[[ex,elevation+.04,ez],[n.x,n.y+.005,n.z]]};
    if([...lots,...legacy].some(p=>segmentHitsLot(...entrance.points,p,3))||lots.some(p=>segmentHitsLot(...p.entrance.points,lot,3)))return;
    const slot=lots.length;
    lots.push({...lot,x:rx*8+slot%8,z:rz*8+Math.floor(slot/8),elevation,min,max,relief:max-min,biome:'沿街缓坡城区',buildable:true,entrance});
  }
  for(const road of plan.roads){if(road.class==='arterial')continue;let traveled=0,next=36;
    for(let i=1;i<road.points.length;i++){
      const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
      for(;next<=traveled+length;next+=12){const t=(next-traveled)/length,x=a[0]+dx*t,z=a[2]+dz*t,offset=32*(Math.abs(nx)+Math.abs(nz))+road.width/2+12;for(const side of [-1,1])candidate(road,x+nx*offset*side,z+nz*offset*side);}
      traveled+=length;
    }
  }
  plan.lots=lots;plan.parks=plan.parks.filter(p=>field.height(p.cx,p.cz)>=3&&!lots.some(l=>overlaps(l,p,6)));return plan;
}
