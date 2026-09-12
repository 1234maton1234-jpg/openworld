export const LAND={grid:2,minArea:256,maxArea:4096,maxSpan:96,minEdge:8,minClearance:8,gap:2,height:null};
const EPS=1e-7;
export const edges=p=>p.map((a,i)=>[a,p[(i+1)%p.length]]);
const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function isConvex(p){
  if(p.length<3)return true;
  let sign=0;
  for(const [a,b] of edges(p))for(const c of p){const turn=orient(a,b,c);if(Math.abs(turn)<EPS)continue;const next=Math.sign(turn);if(sign&&next!==sign)return false;sign=next;}
  return sign!==0;
}
export function pointSegment(p,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);}
export function intersects(a,b,c,d){const u=orient(a,b,c),v=orient(a,b,d),w=orient(c,d,a),t=orient(c,d,b);return u*v<0&&w*t<0||pointSegment(a,c,d)<EPS||pointSegment(b,c,d)<EPS||pointSegment(c,a,b)<EPS||pointSegment(d,a,b)<EPS;}
export function inside(poly,p){let yes=false;for(const [a,b] of edges(poly)){if(pointSegment(p,a,b)<EPS)return true;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
export const boundaryDistance=(poly,p)=>Math.min(...edges(poly).map(([a,b])=>pointSegment(p,a,b)));
export function segmentDistance(a,b,c,d){return intersects(a,b,c,d)?0:Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));}
export function polygonDistance(a,b){if(a.some(p=>inside(b,p))||b.some(p=>inside(a,p)))return 0;return Math.min(...edges(a).flatMap(([p,q])=>edges(b).map(([r,s])=>segmentDistance(p,q,r,s))));}
export function containsPolygon(poly,other){
  if(!other.every(p=>inside(poly,p)))return false;
  for(const [a,b] of edges(other)){const cuts=[0,1],dx=b[0]-a[0],dz=b[1]-a[1];for(const [c,d] of edges(poly)){const ux=d[0]-c[0],uz=d[1]-c[1],den=dx*uz-dz*ux;if(Math.abs(den)<EPS)continue;const t=((c[0]-a[0])*uz-(c[1]-a[1])*ux)/den,u=((c[0]-a[0])*dz-(c[1]-a[1])*dx)/den;if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);}cuts.sort((x,y)=>x-y);for(let i=1;i<cuts.length;i++){const t=(cuts[i-1]+cuts[i])/2;if(!inside(poly,[a[0]+dx*t,a[1]+dz*t]))return false;}}
  return true;
}
export function polygonInfo(p,limits=LAND){
  const reject=message=>{throw Object.assign(new Error(message),{status:400});};
  if(!Array.isArray(p)||p.length<3||p.length>8||p.some(v=>!Array.isArray(v)||v.length!==2||v.some(n=>!Number.isFinite(n)||Math.abs(n)>2**40||n%LAND.grid!==0)))reject('需要 3～8 个顶点，坐标须吸附到 2 米网格');
  if(!isConvex(p))reject('地皮只能是凸多边形，边界不能内凹或自交');
  const e=edges(p);for(let i=0;i<e.length;i++){const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length];if(pointSegment(c,a,b)<EPS||pointSegment(a,b,c)<EPS)reject('边界不能折返或重叠');if(Math.hypot(e[i][0][0]-e[i][1][0],e[i][0][1]-e[i][1][1])<LAND.minEdge)reject('每条边至少 8 米');for(let j=i+1;j<e.length;j++)if(j!==i+1&&!(i===0&&j===e.length-1)&&segmentDistance(...e[i],...e[j])<LAND.minClearance-EPS)reject('边界不能自交，也不能形成不足 8 米的窄缝');}
  const left=Math.min(...p.map(v=>v[0])),right=Math.max(...p.map(v=>v[0])),bottom=Math.min(...p.map(v=>v[1])),top=Math.max(...p.map(v=>v[1])),width=right-left,depth=top-bottom;
  const cx=(left+right)/2,cz=(bottom+top)/2,area=Math.abs(e.reduce((sum,[a,b])=>sum+(a[0]-cx)*(b[1]-cz)-(b[0]-cx)*(a[1]-cz),0))/2;
  const minArea=limits.minArea??LAND.minArea,maxArea=limits.maxArea===null?Infinity:(limits.maxArea??LAND.maxArea),maxSpan=limits.maxSpan===null?Infinity:(limits.maxSpan??LAND.maxSpan),maxAspectRatio=limits.maxAspectRatio??4;
  if(area<minArea||area>maxArea)reject(Number.isFinite(maxArea)?`面积须为 ${minArea}～${maxArea} 平方米`:`面积至少为 ${minArea} 平方米`);
  if(Math.max(width,depth)>maxSpan||Math.max(width,depth)/Math.min(width,depth)>maxAspectRatio)reject(Number.isFinite(maxSpan)?`外接长宽不超过 ${maxSpan} 米，长宽比不超过 ${maxAspectRatio}:1`:`长宽比不超过 ${maxAspectRatio}:1`);
  if(area/(width*depth)<.35)reject('地皮过于细长或零碎，请调整顶点');
  return {polygon:p,area,cx,cz,width,depth,left,right,bottom,top};
}
export function plotPolygon(p){return p.polygon||[[p.cx-(p.width||64)/2,p.cz-(p.depth||64)/2],[p.cx+(p.width||64)/2,p.cz-(p.depth||64)/2],[p.cx+(p.width||64)/2,p.cz+(p.depth||64)/2],[p.cx-(p.width||64)/2,p.cz+(p.depth||64)/2]];}
