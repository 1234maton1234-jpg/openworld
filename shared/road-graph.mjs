const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const distance=(a,b)=>Math.hypot(b[0]-a[0],b[2]-a[2]);
const key=p=>p.map(v=>Math.round(v*100)).join(',');
const cross=(x,z,u,v)=>x*v-z*u;
export function roadGraph(roads){
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
  return {nodes,edges};
}

