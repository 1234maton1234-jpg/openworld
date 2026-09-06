export function archRoad(road){
  if(!road.sections||road.archVersion===1)return road;
  const sections=road.sections.map(section=>{
    if(section.kind!=='crossing'||section.compatibility||section.points.length<3)return section;
    const points=section.points,distances=[0];let grade=0;
    for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],span=Math.hypot(b[0]-a[0],b[2]-a[2]);if(span<1e-6)return section;distances.push(distances.at(-1)+span);grade=Math.max(grade,Math.abs(b[1]-a[1])/span);}
    const length=distances.at(-1),rise=Math.min(24,length*.015,Math.max(0,.05-grade)*length/Math.PI*.95);
    if(rise<.02)return section;
    return {...section,points:points.map((p,i)=>i===0||i===points.length-1?p:[p[0],p[1]+rise*Math.sin(Math.PI*distances[i]/length)**2,p[2]])};
  });
  return {...road,archVersion:1,sections,points:sections.flatMap((s,i)=>s.points.slice(i?1:0))};
}
