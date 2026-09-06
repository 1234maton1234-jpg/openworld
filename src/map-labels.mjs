export function mapBounds(plan,pose){
  const points=(plan?.roads||[]).flatMap(r=>r.points||[]).map(p=>[p[0],p[2]]);
  for(const r of plan?.regions||[])if(r.bounds)points.push([r.bounds[0],r.bounds[1]],[r.bounds[2],r.bounds[3]]);
  if(!points.length)return {x:pose.x-1800,z:pose.z-1800,size:3600};
  const x=Math.min(...points.map(p=>p[0]))-160,z=Math.min(...points.map(p=>p[1]))-160;
  return {x,z,size:Math.max(Math.max(...points.map(p=>p[0]))-x,Math.max(...points.map(p=>p[1]))-z)+160};
}
export function bridgeLabels(roads){return roads.filter(r=>r.bridge&&r.points?.length).map(r=>{const p=r.points[Math.floor(r.points.length/2)],a=r.points[0],b=r.points.at(-1),x=(a[0]+b[0])/2,z=(a[2]+b[2])/2;return {x:p[0],z:p[2],text:r.name||r.title||`桥 · ${Math.round(x)},${Math.round(z)}`,color:'#edf0e5'};});}
export const plotLabel=row=>({x:row.cx,z:row.cz,text:row.name||row.title||(row.login?`${row.login} 的领地`:`领地 ${row.x},${row.z}`),color:row.published?'#9dd5ff':'#ecc886'});
export function riverLabel(line){const parts=line.riverId.split(':'),main=parts[0]==='coastal'&&parts[3]==='main',id=main?`coastal:${parts[1]}:main`:line.riverId;return {id,x:(line.a[0]+line.b[0])/2,z:(line.a[1]+line.b[1])/2,text:parts[0]==='coastal'?main?`河流 ${parts[1]}`:`支流 ${parts[1]}/${parts[2]} ${parts[3]==='east'?'东':'西'}`:`河流 ${line.riverId}`,color:'#80bfd7'};}
