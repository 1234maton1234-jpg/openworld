import {polygonInfo,plotPolygon,polygonDistance,edges,inside,segmentDistance,LAND} from './polygon-land.mjs';
import {createWorldHydrology} from './coastal-hydrology.mjs';
import {createUrbanTerrain} from './urban-terrain.mjs';
import {RIVER_RESERVE} from './construction-layout.mjs';
export function createLandCheck(planning,owned=[],limits=LAND){
  const water=createWorldHydrology(planning.hydrology),field=createUrbanTerrain(planning.terrain?.frozen||[],water,planning.terrain);
  return polygon=>{
    const land=polygonInfo(polygon,limits),reject=message=>{throw Object.assign(new Error(message),{status:409});};
    for(const p of [...owned,...(planning.legacy||[])])if(polygonDistance(polygon,plotPolygon(p))<LAND.gap)reject(`与已领地皮之间须保留至少 ${LAND.gap} 米公共通道`);
    for(const p of owned){const access=p.entrance||(planning.regions||[]).flatMap(r=>r.lots).find(l=>l.x===p.x&&l.z===p.z)?.entrance;if(!access)continue;const [a,b]=access.points.map(v=>[v[0],v[2]]);if(inside(polygon,a)||inside(polygon,b)||edges(polygon).some(([c,d])=>segmentDistance(a,b,c,d)<4))reject('不能占用已有领地通往道路的公共入口');}
    const paths=planning.roads.flatMap(r=>(r.sections||[r]).flatMap(s=>s.points.slice(1).map((b,i)=>({a:[s.points[i][0],s.points[i][2]],b:[b[0],b[2]],ay:s.points[i][1],by:b[1],width:s.width||r.width,id:r.id,bridge:s.kind==='crossing'})))).filter(s=>Math.max(s.a[0],s.b[0])+s.width/2+24>=land.left&&Math.min(s.a[0],s.b[0])-s.width/2-24<=land.right&&Math.max(s.a[1],s.b[1])+s.width/2+24>=land.bottom&&Math.min(s.a[1],s.b[1])-s.width/2-24<=land.top);
    for(const s of paths)if(inside(polygon,s.a)||inside(polygon,s.b)||edges(polygon).some(([a,b])=>segmentDistance(a,b,s.a,s.b)<s.width/2+4))reject('地皮不能占用道路、桥梁或路边公共通道');
    let entrance=null,best=Infinity;
    for(const [a,b] of edges(polygon)){const length=Math.hypot(b[0]-a[0],b[1]-a[1]),count=Math.ceil(length/2);for(let i=0;i<=count;i++){
      const p=[a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count];
      for(const s of paths){if(s.bridge)continue;const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1],t=Math.max(0,Math.min(1,((p[0]-s.a[0])*dx+(p[1]-s.a[1])*dz)/(dx*dx+dz*dz||1))),q=[s.a[0]+dx*t,s.a[1]+dz*t],d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d-s.width/2>18||water.distance(...q)<48)continue;if(d<best){best=d;entrance={roadId:s.id,points:[[p[0],0,p[1]],[q[0],s.ay+(s.by-s.ay)*t,q[1]]]};}}
    }}
    if(entrance){const access=[entrance.points[0][0],entrance.points[0][2]],road=[entrance.points[1][0],entrance.points[1][2]];
      if(owned.some(p=>inside(plotPolygon(p),access)||edges(plotPolygon(p)).some(([a,b])=>segmentDistance(access,road,a,b)<4)))entrance=null;
    }
    let min=Infinity,max=-Infinity;const samples=(land.width/2+1)*(land.depth/2+1),step=Math.max(2,Math.ceil(Math.sqrt(samples/250000))*2);
    for(let x=land.left;x<=land.right;x+=step)for(let z=land.bottom;z<=land.top;z+=step)if(inside(polygon,[x,z])){if(water.distance(x,z)<RIVER_RESERVE)reject('地皮涉及河流、海岸或护岸预留区');const h=field.height(x,z);min=Math.min(min,h);max=Math.max(max,h);}
    if(min<3||max-min>1)reject('地皮高差超过 1 米，请缩小范围或选择更平缓的位置');
    let elevation=(min+max)/2;
    if(entrance){const roadY=entrance.points[1][1],level=Math.max(roadY-.03*best,Math.min(roadY+.03*best,elevation));
      if(Math.max(Math.abs(level-min),Math.abs(level-max))>.8)entrance=null;
      else{elevation=level;entrance.points[0][1]=elevation+.04;}
    }
    return {...land,elevation,entrance,relief:max-min,version:8,buildable:true};
  };
}
