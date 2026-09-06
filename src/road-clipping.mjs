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
