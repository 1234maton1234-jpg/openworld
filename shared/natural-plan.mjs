import {generateRegion,roadHeight,cityHeight,riverDistance,overlaps} from './city-plan.mjs';
export function generateNaturalRegion(x,z,legacy=[],hydrology){
  const plan=generateRegion(x,z,legacy,hydrology),[left,bottom,right,top]=plan.bounds;
  function warp(px,pz){const u=(px-left)/(right-left),v=(pz-bottom)/(top-bottom);if(u<=0||u>=1||v<=0||v>=1)return [px,pz];const envelope=Math.sin(Math.PI*u)*Math.sin(Math.PI*v);return [px+envelope*(48*Math.sin(z*.83+.8)+24*Math.sin(v*Math.PI*2)),pz+envelope*(45*Math.cos(x*.67+.4)+20*Math.sin(u*Math.PI*2))];}
  plan.version=hydrology?3:2;
  plan.roads=plan.roads.map(road=>{const points=road.points.map(([px,y,pz])=>{const [nx,nz]=warp(px,pz);return [nx,nx===px&&nz===pz?y:Math.max(roadHeight(nx,nz),cityHeight(nx,nz,hydrology))+.035,nz];});return {...road,points,bridge:points.some(p=>(hydrology?hydrology.distance(p[0],p[2]):riverDistance(p[0],p[2]))<38)};});
  function nearest(points,x,z){let best;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[2]-a[2],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz))),px=a[0]+dx*t,pz=a[2]+dz*t,d=Math.hypot(x-px,z-pz);if(!best||d<best.d)best={x:px,z:pz,y:a[1]+(b[1]-a[1])*t,d};}return best;}
  const accepted=[];
  for(const lot of plan.lots){const [cx,cz]=warp(lot.cx,lot.cz),road=plan.roads.find(r=>r.id===lot.entrance.roadId),n=nearest(road.points,cx,cz),dx=n.x-cx,dz=n.z-cz,edge=32/Math.max(Math.abs(dx),Math.abs(dz));
    if(edge>=1)continue;
    const moved={...lot,cx,cz,version:plan.version,entrance:{roadId:road.id,points:[[cx+dx*edge,lot.elevation+.04,cz+dz*edge],[n.x,n.y+.005,n.z]]}};
    if(cx-32<left+6||cx+32>right-6||cz-32<bottom+6||cz+32>top-6||[...accepted,...legacy].some(p=>overlaps(moved,p,8)))continue;
    let min=Infinity,max=-Infinity;for(let a=-36;a<=36;a+=4)for(let b=-36;b<=36;b+=4){const h=cityHeight(cx+a,cz+b,hydrology);min=Math.min(min,h);max=Math.max(max,h);}if(min<3||max-min>1)continue;
    if(plan.roads.some(r=>r.points.some(p=>Math.hypot(Math.max(0,Math.abs(p[0]-cx)-32),Math.max(0,Math.abs(p[2]-cz)-32))<r.width/2+6)))continue;
    moved.min=min;moved.max=max;moved.relief=max-min;accepted.push(moved);
  }
  plan.lots=accepted;plan.parks=plan.parks.map(p=>{const [cx,cz]=warp(p.cx,p.cz);return {...p,cx,cz};});return plan;
}
