import {SIDEWALK_WIDTH} from '../shared/street-style.mjs';
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const distance=(a,b)=>Math.hypot(b[0]-a[0],b[2]-a[2]);
const key=p=>p.map(v=>Math.round(v*100)).join(',');
const cross=(x,z,u,v)=>x*v-z*u;
const subtract=(intervals,lo,hi)=>intervals.flatMap(([a,b])=>hi<=a||lo>=b?[[a,b]]:[[a,Math.max(a,lo)],[Math.min(b,hi),b]].filter(([v,w])=>w-v>.01));
function sharedInterval(edge,other){
  const a=edge.a.p,b=edge.b.p,c=other.a.p,d=other.b.p,len=distance(a,b),span=distance(c,d),ux=(b[0]-a[0])/len,uz=(b[2]-a[2])/len,vx=(d[0]-c[0])/span,vz=(d[2]-c[2])/span,dot=ux*vx+uz*vz;
  if(Math.abs(dot)<.985)return null;
  let lo=0,hi=len;
  function clip(offset,slope,min,max){if(Math.abs(slope)<1e-9)return offset>=min&&offset<=max;let p=(min-offset)/slope,q=(max-offset)/slope;if(p>q)[p,q]=[q,p];lo=Math.max(lo,p);hi=Math.min(hi,q);return hi-lo>.01;}
  const along=(a[0]-c[0])*vx+(a[2]-c[2])*vz,perp=cross(a[0]-c[0],a[2]-c[2],vx,vz),radius=Math.min(edge.width,other.width)/2,grade=(d[1]-c[1])/span;
  if(!clip(along,dot,0,span)||!clip(perp,cross(ux,uz,vx,vz),-radius,radius)||!clip(a[1]-c[1]-along*grade,(b[1]-a[1])/len-dot*grade,-.5,.5))return null;
  return [lo,hi];
}
function quad(a,b,left,right){const length=distance(a,b),nx=-(b[2]-a[2])/length,nz=(b[0]-a[0])/length;return [[a,left],[a,right],[b,right],[b,left]].map(([p,s])=>[p[0]+nx*s,p[1],p[2]+nz*s]);}
function hull(points){
  const sorted=[...points].sort((a,b)=>a[0]-b[0]||a[2]-b[2]),turn=(a,b,c)=>cross(b[0]-a[0],b[2]-a[2],c[0]-a[0],c[2]-a[2]);
  const half=list=>{const out=[];for(const p of list){while(out.length>1&&turn(out.at(-2),out.at(-1),p)<=1e-8)out.pop();out.push(p);}return out;};
  return [...half(sorted).slice(0,-1),...half(sorted.reverse()).slice(0,-1)];
}
export function junctionHeight(patches,x,z){
  for(const patch of patches)for(const ring of [patch.road,patch.walk])for(let i=0;i<ring.length;i++){
    const a=patch.center,b=ring[i],c=ring[(i+1)%ring.length],den=cross(b[0]-a[0],b[2]-a[2],c[0]-a[0],c[2]-a[2]);
    if(Math.abs(den)<1e-8)continue;
    const u=cross(x-a[0],z-a[2],c[0]-a[0],c[2]-a[2])/den,v=cross(b[0]-a[0],b[2]-a[2],x-a[0],z-a[2])/den;
    if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8)return a[1]+u*(b[1]-a[1])+v*(c[1]-a[1]);
  }
}
export function roadMarkings(roads){
  const segments=[],seen=new Map(),bins=new Map(),stations=new Map();
  for(const road of [...roads].sort((a,b)=>String(a.id).localeCompare(String(b.id))))for(const path of road.sections||[road])for(let i=1;i<path.points.length;i++){
    const a=path.points[i-1],b=path.points[i];if(distance(a,b)<.01)continue;
    const id=[key(a),key(b)].sort().join('|'),width=path.width||road.width,station=stations.get(road)||0,bridge=path.kind==='crossing'||(!road.sections&&road.bridge===true);
    stations.set(road,station+distance(a,b));
    if(seen.has(id)){seen.get(id).width=Math.max(seen.get(id).width,width);seen.get(id).bridge||=bridge;continue;}
    const s={a,b,width,bridge,station,source:String(road.id),cuts:[0,1]};seen.set(id,s);segments.push(s);
  }
  for(let i=0;i<segments.length;i++){
    const s=segments[i],candidates=new Set();
    for(let x=Math.floor(Math.min(s.a[0],s.b[0])/64);x<=Math.floor(Math.max(s.a[0],s.b[0])/64);x++)for(let z=Math.floor(Math.min(s.a[2],s.b[2])/64);z<=Math.floor(Math.max(s.a[2],s.b[2])/64);z++){
      const id=x+','+z,list=bins.get(id)||[];for(const j of list)candidates.add(j);list.push(i);bins.set(id,list);
    }
    for(const j of candidates){const r=segments[j],dx=s.b[0]-s.a[0],dz=s.b[2]-s.a[2],ux=r.b[0]-r.a[0],uz=r.b[2]-r.a[2],den=cross(dx,dz,ux,uz),qx=r.a[0]-s.a[0],qz=r.a[2]-s.a[2];
      if(Math.abs(den)<1e-8){
        if(Math.abs(cross(qx,qz,dx,dz))>.001)continue;
        for(const [v,w] of [[s,r],[r,s]])for(const p of [w.a,w.b]){const vx=v.b[0]-v.a[0],vz=v.b[2]-v.a[2],t=((p[0]-v.a[0])*vx+(p[2]-v.a[2])*vz)/(vx*vx+vz*vz);if(t>0&&t<1&&Math.abs(mix(v.a,v.b,t)[1]-p[1])<.05)v.cuts.push(t);}
        continue;
      }
      const t=cross(qx,qz,ux,uz)/den,u=cross(qx,qz,dx,dz)/den;
      if(t>=-1e-8&&t<=1+1e-8&&u>=-1e-8&&u<=1+1e-8&&Math.abs(mix(s.a,s.b,t)[1]-mix(r.a,r.b,u)[1])<.05){s.cuts.push(Math.max(0,Math.min(1,t)));r.cuts.push(Math.max(0,Math.min(1,u)));}
    }
  }
  const nodes=new Map(),edges=new Map();
  function node(p){const id=key(p);if(!nodes.has(id))nodes.set(id,{p,arms:[]});return nodes.get(id);}
  for(const s of segments){const cuts=[...new Set(s.cuts)].sort((a,b)=>a-b);for(let i=1;i<cuts.length;i++){
    const a=node(mix(s.a,s.b,cuts[i-1])),b=node(mix(s.a,s.b,cuts[i]));if(distance(a.p,b.p)<.01)continue;
    const id=[key(a.p),key(b.p)].sort().join('|');if(edges.has(id)){edges.get(id).width=Math.max(edges.get(id).width,s.width);edges.get(id).bridge||=s.bridge;continue;}
    const edge={a,b,width:s.width,bridge:s.bridge,station:s.station+distance(s.a,s.b)*cuts[i-1],source:s.source};edges.set(id,edge);a.arms.push({to:b,edge});b.arms.push({to:a,edge});
  }}
  const corridors=new Map();
  for(const e of edges.values()){
    const a=e.a.p,b=e.b.p,pad=e.width/2;e.paint=[[0,distance(a,b)]];
    for(let x=Math.floor((Math.min(a[0],b[0])-pad)/64);x<=Math.floor((Math.max(a[0],b[0])+pad)/64);x++)for(let z=Math.floor((Math.min(a[2],b[2])-pad)/64);z<=Math.floor((Math.max(a[2],b[2])+pad)/64);z++){const id=x+','+z;if(!corridors.has(id))corridors.set(id,[]);corridors.get(id).push(e);}
  }
  for(const e of edges.values()){
    const a=e.a.p,b=e.b.p,candidates=new Set();
    for(let x=Math.floor(Math.min(a[0],b[0])/64);x<=Math.floor(Math.max(a[0],b[0])/64);x++)for(let z=Math.floor(Math.min(a[2],b[2])/64);z<=Math.floor(Math.max(a[2],b[2])/64);z++)for(const r of corridors.get(x+','+z)||[])candidates.add(r);
    for(const r of candidates){if(r.source===e.source||r.width<e.width||r.width===e.width&&r.source>=e.source)continue;const overlap=sharedInterval(e,r);if(overlap)e.paint=subtract(e.paint,...overlap);}
  }
  const junctions=[...nodes.values()].filter(n=>n.arms.length>=3);
  for(const n of junctions){
    n.radius=Math.max(...n.arms.map(a=>a.edge.width))/2+6;
    for(const arm of n.arms){arm.angle=Math.atan2(arm.to.p[2]-n.p[2],arm.to.p[0]-n.p[0]);arm.setback=n.radius;}
    const arms=[...n.arms].sort((a,b)=>a.angle-b.angle);
    for(let i=0;i<arms.length;i++){const a=arms[i],b=arms[(i+1)%arms.length],angle=(b.angle-a.angle+Math.PI*2)%(Math.PI*2);if(angle>.1&&angle<Math.PI){const setback=Math.min(60,(Math.max(a.edge.width,b.edge.width)/2+SIDEWALK_WIDTH)/Math.tan(angle/2)+6);a.setback=Math.max(a.setback,setback);b.setback=Math.max(b.setback,setback);}}
    n.radius=Math.max(...arms.map(a=>a.setback));
  }
  const yellow=[],white=[],lanes=[],stops=[],arrows=[],furniture=[];let crosswalks=0;
  for(const e of edges.values()){
    const a=e.a.p,b=e.b.p,length=distance(a,b),dx=(b[0]-a[0])/length,dz=(b[2]-a[2])/length;let intervals=e.paint;
    for(const n of junctions){if(Math.abs(n.p[1]-(a[1]+b[1])/2)>3)continue;const along=(n.p[0]-a[0])*dx+(n.p[2]-a[2])*dz,perp=Math.abs((n.p[0]-a[0])*dz-(n.p[2]-a[2])*dx),mx=(a[0]+b[0])/2-n.p[0],mz=(a[2]+b[2])/2-n.p[2];
      const arm=n.arms.reduce((best,v)=>{const dot=(v.to.p[0]-n.p[0])*mx+(v.to.p[2]-n.p[2])*mz,score=dot/distance(n.p,v.to.p);return !best||score>best.score?{score,arm:v}:best;},null).arm,radius=arm.setback;if(perp>=radius)continue;
      const delta=Math.sqrt(radius*radius-perp*perp),lo=along-delta,hi=along+delta;
      intervals=intervals.flatMap(([start,end])=>hi<=start||lo>=end?[[start,end]]:[[start,Math.max(start,lo)],[Math.min(end,hi),end]].filter(([v,w])=>w-v>.01));
    }
    for(const [start,end] of intervals)for(const offset of [-.23,.23])yellow.push(quad(mix(a,b,start/length),mix(a,b,end/length),offset-.075,offset+.075));
    const laneCount=Math.max(1,Math.floor(e.width/2/3.5));
    for(const [start,end] of intervals)for(let lane=1;lane<laneCount;lane++)for(const side of [-1,1]){
      const offset=side*e.width/2*lane/laneCount,phase=a[0]*dx+a[2]*dz;
      for(let dash=Math.floor((phase+start)/9)*9-phase;dash<end;dash+=9){const lo=Math.max(start,dash),hi=Math.min(end,dash+4);if(hi>lo)lanes.push(quad(mix(a,b,lo/length),mix(a,b,hi/length),offset-.065,offset+.065));}
    }
  }
  function sample(start,arm,length,paint=false){let from=start,to=arm.to,remaining=length,edge=arm.edge;const visited=new Set([start]);
    while(true){if(paint&&edge.bridge)return null;const span=distance(from.p,to.p);if(remaining<=span){const at=from===edge.a?remaining:span-remaining;if(paint&&!edge.paint.some(([lo,hi])=>at>=lo&&at<=hi))return null;return mix(from.p,to.p,remaining/span);}remaining-=span;if(to.arms.length!==2||visited.has(to))return null;visited.add(to);const next=to.arms.find(a=>a.to!==from);from=to;to=next.to;edge=next.edge;}
  }
  function approachRoom(start,arm){
    let from=start,to=arm.to,length=distance(from.p,to.p);const visited=new Set([start]);
    while(to.arms.length===2&&!visited.has(to)&&length<arm.setback+90){visited.add(to);const next=to.arms.find(a=>a.to!==from);from=to;to=next.to;length+=distance(from.p,to.p);}
    return to.arms.length<3||length>arm.setback+(to.radius||0)+24;
  }
  const patches=[];
  for(const n of junctions){const road=[],walk=[];
    for(const arm of n.arms){const a=sample(n,arm,arm.setback-5),b=sample(n,arm,arm.setback-4);if(!a||!b)continue;
      const span=distance(a,b);if(span<.01)continue;const nx=-(b[2]-a[2])/span,nz=(b[0]-a[0])/span;
      for(const side of [-1,1]){road.push([a[0]+nx*arm.edge.width/2*side,a[1],a[2]+nz*arm.edge.width/2*side]);walk.push([a[0]+nx*(arm.edge.width/2+SIDEWALK_WIDTH)*side,a[1],a[2]+nz*(arm.edge.width/2+SIDEWALK_WIDTH)*side]);}
    }
    if(road.length===n.arms.length*2)patches.push({center:n.p,radius:n.radius,road:hull(road),walk:hull(walk),approaches:n.arms.map(a=>({setback:a.setback,width:a.edge.width}))});
  }
  for(const n of junctions)for(const arm of n.arms){if(!approachRoom(n,arm))continue;const start=arm.setback-4.5,end=arm.setback-1,a=sample(n,arm,start,true),b=sample(n,arm,end,true);if(!a||!b||distance(a,b)<.01||!sample(n,arm,end+8,true))continue;
    const half=arm.edge.width/2-.6;for(let offset=-half;offset+.5<=half;offset+=1)white.push(quad(a,b,offset,offset+.5));crosswalks++;
    const stopA=sample(n,arm,end+1.5,true),stopB=sample(n,arm,end+1.9,true);
    if(stopA&&stopB)stops.push(quad(stopA,stopB,.4,half));
    const near=sample(n,arm,end+6,true),far=sample(n,arm,end+11,true);
    if(near&&far){const count=Math.max(1,Math.floor(arm.edge.width/2/3.5));for(let lane=0;lane<count;lane++){
      const offset=(lane+.5)*arm.edge.width/2/count,span=distance(far,near),nx=-(far[2]-near[2])/span,nz=(far[0]-near[0])/span;
      const at=(t,s)=>{const p=mix(near,far,t);return [p[0]+nx*s,p[1],p[2]+nz*s];};
      const choices=n.arms.filter(v=>v!==arm).map(v=>{const d=distance(n.p,v.to.p),x=(v.to.p[0]-n.p[0])/d,z=(v.to.p[2]-n.p[2])/d;return {side:x*nx+z*nz,forward:-(x*(far[0]-near[0])+z*(far[2]-near[2]))/span};});
      const straight=choices.some(v=>v.forward>.75),left=choices.some(v=>v.side<-.5),right=choices.some(v=>v.side>.5);
      const turn=count>1&&lane===0&&left?-1:count>1&&lane===count-1&&right?1:straight?0:left?-1:right?1:0;
      if(!turn){arrows.push([at(.25,offset-.16),at(.25,offset+.16),at(1,offset+.16),at(1,offset-.16)]);arrows.push([at(0,offset-.03),at(0,offset+.03),at(.4,offset+.8),at(.4,offset-.8)]);}
      else{const elbow=at(.3,offset),tip=at(.3,offset+turn*1.35);arrows.push(quad(at(1,offset),elbow,-.16,.16),quad(elbow,tip,-.16,.16));
        const dx=(tip[0]-elbow[0])/1.35,dz=(tip[2]-elbow[2])/1.35,head=(back,side)=>[tip[0]-dx*back-dz*side,tip[1],tip[2]-dz*back+dx*side];arrows.push([head(0,-.03),head(0,.03),head(.8,.55),head(.8,-.55)]);
      }
    }}
  }
  const lampBins=new Map();
  for(const e of edges.values()){
    const a=e.a.p,b=e.b.p,len=distance(a,b),dx=(b[0]-a[0])/len,dz=(b[2]-a[2])/len,offset=e.width/2+SIDEWALK_WIDTH-1;
    for(let at=Math.ceil((e.station-16)/32)*32+16-e.station;at<len;at+=32){
      if(!e.paint.some(([lo,hi])=>at>=lo&&at<=hi))continue;
      const center=mix(a,b,at/len);
      for(const side of [-1,1]){
        const p=[center[0]-dz*offset*side,center[1],center[2]+dx*offset*side];
        const roadsHere=corridors.get(Math.floor(p[0]/64)+','+Math.floor(p[2]/64))||[];
        if(roadsHere.some(r=>{const c=r.a.p,d=r.b.p,span=distance(c,d),t=((p[0]-c[0])*(d[0]-c[0])+(p[2]-c[2])*(d[2]-c[2]))/(span*span);return t>=0&&t<=1&&Math.abs(p[1]-mix(c,d,t)[1])<2&&distance(p,mix(c,d,t))<r.width/2+.5;}))continue;
        if(patches.some(v=>Math.abs(v.center[1]-p[1])<2&&distance(v.center,p)<v.radius&&v.road.every((c,i)=>{const d=v.road[(i+1)%v.road.length];return cross(d[0]-c[0],d[2]-c[2],p[0]-c[0],p[2]-c[2])>=0;})))continue;
        const bx=Math.floor(p[0]/12),bz=Math.floor(p[2]/12);let nearby=false;
        for(let x=bx-1;x<=bx+1;x++)for(let z=bz-1;z<=bz+1;z++)if((lampBins.get(x+','+z)||[]).some(q=>Math.abs(p[1]-q[1])<2&&distance(p,q)<12))nearby=true;
        if(nearby)continue;
        const id=bx+','+bz;if(!lampBins.has(id))lampBins.set(id,[]);lampBins.get(id).push(p);
        furniture.push({p,angle:Math.atan2(dx,dz)});
      }
    }
  }
  return {yellow,white,lanes,stops,arrows,furniture,crosswalks,junctions:junctions.map(n=>n.p),patches};
}
