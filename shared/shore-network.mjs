import {pointSegment,segmentDistance} from './polygon-land.mjs';
import {segmentHitsLot} from './urban-plan.mjs';
const key=p=>p.map(v=>Math.round(v*100)).join(','),xz=p=>[p[0],p[2]],distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const length=r=>r.points.slice(1).reduce((sum,p,i)=>sum+distance(p,r.points[i]),0);
export function refineShoreNetwork(input,water,lots=[]){
  const roads=[...input].sort((a,b)=>a.id.localeCompare(b.id)),degree=new Map(),heads=roads.filter(r=>r.bridge).flatMap(r=>[r.points[0],r.points.at(-1)]);
  for(const r of roads)for(const p of [r.points[0],r.points.at(-1)])degree.set(key(p),(degree.get(key(p))||0)+1);
  const access=lots.flatMap(l=>l.entrance?.points?[l.entrance.points.at(-1)]:[]);
  const protectedRoad=r=>access.some(p=>r.points.slice(1).some((b,i)=>pointSegment(xz(p),xz(r.points[i]),xz(b))<1));
  let kept=roads.filter(r=>{
    if(r.bridge||protectedRoad(r))return true;const a=r.points[0],b=r.points.at(-1),da=degree.get(key(a)),db=degree.get(key(b)),leaf=da===1&&db>=3?a:db===1&&da>=3?b:null;
    const length=r.points.slice(1).reduce((n,p,i)=>n+distance(p,r.points[i]),0);
    return !leaf||length>96||!heads.some(p=>distance(p,leaf)<160)||!r.points.every(p=>water.distance(p[0],p[2])<150);
  });
  for(const r of [...kept].sort((a,b)=>length(b)-length(a)||a.id.localeCompare(b.id))){
    const span=length(r);if(r.bridge||span>192||protectedRoad(r)||!r.points.every(p=>water.distance(p[0],p[2])<150))continue;
    const start=key(r.points[0]),end=key(r.points.at(-1)),limit=Math.min(384,span*2.2+24),best=new Map([[start,0]]),queue=[[start,0]];
    const alternatives=kept.filter(s=>s!==r&&!s.bridge&&s.points.every(p=>r.points.slice(1).some((b,i)=>pointSegment(xz(p),xz(r.points[i]),xz(b))<=96)));
    while(queue.length){queue.sort((a,b)=>b[1]-a[1]);const [id,cost]=queue.pop();if(cost!==best.get(id))continue;if(id===end)break;for(const s of alternatives){const a=key(s.points[0]),b=key(s.points.at(-1)),next=a===id?b:b===id?a:null;if(next===null)continue;const total=cost+length(s);if(total<=limit&&total<(best.get(next)??Infinity)){best.set(next,total);queue.push([next,total]);}}}
    if(best.has(end))kept=kept.filter(s=>s!==r);
  }
  const result=[];
  for(const r of kept){
    if(r.bridge||protectedRoad(r)||!r.points.some(p=>water.distance(p[0],p[2])<150)){result.push(r);continue;}
    const nearby=kept.filter(s=>s!==r&&!s.points.some(p=>[r.points[0],r.points.at(-1)].some(q=>key(p)===key(q))));
    function clear(a,b,between){
      const length=distance(a,b);if(length>256||Math.abs(b[1]-a[1])>length*.05||between.some(p=>pointSegment(xz(p),xz(a),xz(b))>24))return false;
      const count=Math.max(1,Math.ceil(length/4));for(let i=0;i<=count;i++){const t=i/count,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t;if(water.distance(x,z)<Math.max(58,r.width/2+40))return false;}
      if(lots.some(l=>segmentHitsLot(a,b,l,r.width/2+6)))return false;
      for(const s of nearby)for(let i=1;i<s.points.length;i++){const p=s.points[i-1],q=s.points[i];if(Math.min(a[1],b[1])>Math.max(p[1],q[1])+2||Math.min(p[1],q[1])>Math.max(a[1],b[1])+2)continue;if(segmentDistance(xz(a),xz(b),xz(p),xz(q))<(r.width+s.width)/2+6)return false;}
      return true;
    }
    const points=[r.points[0]];for(let i=0;i<r.points.length-1;){let j=i+1,last=j;while(last+1<r.points.length&&distance(r.points[i],r.points[last+1])<=256)last++;for(let k=last;k>i+1;k--)if(clear(r.points[i],r.points[k],r.points.slice(i+1,k))){j=k;break;}points.push(r.points[j]);i=j;}
    result.push({...r,points,sections:[{kind:'land',width:r.width,points}]});
  }
  return result;
}
