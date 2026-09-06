export function sameLevelCut(road,surface,minGap=-.15,maxGap=.4){
  function plane([a,b,c]){const dx=b[0]-a[0],dz=b[2]-a[2],ex=c[0]-a[0],ez=c[2]-a[2],det=dx*ez-dz*ex;if(Math.abs(det)<1e-8)return null;const x=((b[1]-a[1])*ez-(c[1]-a[1])*dz)/det,z=(dx*(c[1]-a[1])-ex*(b[1]-a[1]))/det;return p=>a[1]+x*(p[0]-a[0])+z*(p[2]-a[2]);}
  const roadY=plane(road),surfaceY=plane(surface);if(!roadY||!surfaceY)return [];
  let ring=road;
  for(const side of [p=>surfaceY(p)-roadY(p)-minGap,p=>maxGap-surfaceY(p)+roadY(p)]){
    const next=[];for(let i=0;i<ring.length;i++){const p=ring[i],q=ring[(i+1)%ring.length],u=side(p),v=side(q);if(u>=0)next.push(p);if((u>=0)!==(v>=0)){const t=u/(u-v);next.push(p.map((n,j)=>n+(q[j]-n)*t));}}ring=next;
  }
  return ring;
}

export function subtractConvex(polygon,clip){
  let remaining=polygon;const pieces=[];
  const winding=Math.sign(clip.reduce((sum,a,i)=>{const b=clip[(i+1)%clip.length];return sum+a[0]*b[2]-b[0]*a[2];},0))||1;
  for(let i=0;i<clip.length&&remaining.length>=3;i++){
    const a=clip[i],b=clip[(i+1)%clip.length],side=p=>winding*((b[0]-a[0])*(p[2]-a[2])-(b[2]-a[2])*(p[0]-a[0])),inside=[],outside=[];
    for(let j=0;j<remaining.length;j++){
      const p=remaining[j],q=remaining[(j+1)%remaining.length],u=side(p),v=side(q);
      (u>=0?inside:outside).push(p);
      if((u>=0)!==(v>=0)){const t=u/(u-v),point=p.map((value,k)=>value+(q[k]-value)*t);inside.push(point);outside.push(point);}
    }
    if(outside.length>=3)pieces.push(outside);remaining=inside;
  }
  return pieces;
}
