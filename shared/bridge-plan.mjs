import {roadProfile} from './road-hierarchy.mjs';
const STEP=64,DRY=58,HEAD=84;
const key=p=>p[0]+','+p[2],distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
function samples(a,b,spacing=8){const n=Math.max(1,Math.ceil(distance(a,b)/spacing));return Array.from({length:n+1},(_,i)=>a.map((v,j)=>v+(b[j]-v)*i/n));}
export function createBridgePlanner(hydrology,field,{roads:fixed=[],lots:protectedLots=[]}={}){
  const coastal=hydrology.version===3,bridgeWidth=coastal?28:16;
  const saved=new Map(fixed.map(r=>[r.id,r])),nodes=new Map(),cache=new Map(),siteCache=new Map(),dryCache=new Map();
  for(const r of fixed)for(const p of [r.points[0],r.points.at(-1)])nodes.set(key(p),p);
  const fixedNodes=new Map(nodes);
  const height=p=>[p[0],field.base(p[0],p[2])+.035,p[2]];
  const wet=p=>hydrology.distance(p[0],p[2]);
  function allowed(p,clearance=DRY){return wet(p)>=clearance&&!protectedLots.some(l=>Math.abs(p[0]-l.cx)<l.width/2+14&&Math.abs(p[2]-l.cz)<l.depth/2+14);}
  function clear(a,b){return samples(a,b).every(p=>allowed(p));}
  function junction(p){const id=key(p);if(nodes.has(id))return nodes.get(id);if(nodes.size>8192){nodes.clear();for(const [k,v] of fixedNodes)nodes.set(k,v);}let best=null,score=Infinity;
    const radius=coastal?1536:384;for(let dx=-radius;dx<=radius;dx+=16)for(let dz=-radius;dz<=radius;dz+=16){const d=dx*dx+dz*dz;if(d>=score)continue;const q=height([p[0]+dx,0,p[2]+dz]);if(allowed(q,HEAD)){best=q;score=d;}}
    if(!best)throw new Error('No dry road junction near '+id);nodes.set(id,best);return best;
  }
  function portal(p){if(allowed(p))return {point:p};let best,score=Infinity;
    for(let dx=-192;dx<=192;dx+=16)for(let dz=-192;dz<=192;dz+=16){const d=dx*dx+dz*dz;if(d>=score)continue;const q=height([p[0]+dx,0,p[2]+dz]);if(!allowed(q,HEAD)||samples(p,q).some(v=>protectedLots.some(l=>Math.abs(v[0]-l.cx)<l.width/2+14&&Math.abs(v[2]-l.cz)<l.depth/2+14)))continue;best=q;score=d;}
    if(!best)throw new Error('No preserved bridgehead connection at '+key(p));const points=samples(p,best,4);return {point:best,section:{id:'legacy-link:'+key(p),kind:'crossing',compatibility:true,width:16,points,deckStart:0,deckEnd:points.length-1}};
  }
  function site(line){const id=`bridge:${line.riverId}:${line.index}`;if(siteCache.has(id))return siteCache.get(id);if(siteCache.size>4096)siteCache.clear();
    const {a,b}=line,dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length,c=[(a[0]+b[0])/2,0,(a[1]+b[1])/2],ends=[],decks=[];
    for(const side of [-1,1]){let deck,head;for(let offset=8;offset<=(coastal?2048:224);offset+=8){const p=height([c[0]+side*nx*offset,0,c[2]+side*nz*offset]);if(!deck&&allowed(p,42))deck=p;if(deck&&offset>=distance(c,deck)+36&&allowed(p,HEAD)){head=p;break;}}if(!deck||!head){siteCache.set(id,null);return null;}decks.push(deck);ends.push(head);}
    const points=[...samples(ends[0],decks[0],4).map(height),...samples(decks[0],decks[1],4).slice(1),...samples(decks[1],ends[1],4).slice(1).map(height)];
    let groups=0,inWater=false;for(const p of points){const current=wet(p)<14;if(current&&!inWater)groups++;inWater=current;}
    if(groups!==1||distance(...decks)>(coastal?3000:240)||points.some((p,i)=>i&&Math.abs(p[1]-points[i-1][1])/distance(p,points[i-1])>.05)){siteCache.set(id,null);return null;}
    const result={id,kind:'crossing',points,deckStart:points.findIndex(p=>distance(p,decks[0])<.01),deckEnd:points.findIndex(p=>distance(p,decks[1])<.01),width:bridgeWidth};siteCache.set(id,result);return result;
  }
  function sites(bounds){const found=new Map(),[l,b,r,t]=bounds;
    for(let x=Math.floor(l/128)*128;x<=r;x+=128)for(let z=Math.floor(b/128)*128;z<=t;z+=128)for(const line of hydrology.segments(x,z)){if(line.index%8!==4)continue;const s=site(line);if(s&&s.points.every(p=>p[0]>=l&&p[0]<=r&&p[2]>=b&&p[2]<=t))found.set(s.id,s);}
    return [...found.values()].sort((a,b)=>a.id.localeCompare(b.id));
  }
  function search(start,end,margin){
    const bounds=[Math.min(start[0],end[0])-margin,Math.min(start[2],end[2])-margin,Math.max(start[0],end[0])+margin,Math.max(start[2],end[2])+margin],crossings=sites(bounds),points=new Map([['s',start],['t',end]]),extra=new Map(),links=new Map();
    const connect=(a,b,span)=>{if(!extra.has(a))extra.set(a,[]);extra.get(a).push({id:b,span});};
    for(const s of crossings){const a=s.id+':a',b=s.id+':b';points.set(a,s.points[0]);points.set(b,s.points.at(-1));connect(a,b,s);connect(b,a,{...s,points:s.points.toReversed(),deckStart:s.points.length-1-s.deckEnd,deckEnd:s.points.length-1-s.deckStart});}
    const grid=(x,z)=>{const id=`g:${x}:${z}`;if(points.has(id))return id;const p=height([x*STEP,0,z*STEP]);if(p[0]<bounds[0]||p[0]>bounds[2]||p[2]<bounds[1]||p[2]>bounds[3])return null;let dry=dryCache.get(id);if(dry===undefined){dry=allowed(p);if(dryCache.size>12000)dryCache.clear();dryCache.set(id,dry);}if(!dry)return null;points.set(id,p);return id;};
    const special=[...points.keys()];for(const id of special){const p=points.get(id),gx=Math.round(p[0]/STEP),gz=Math.round(p[2]/STEP);for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const g=grid(gx+dx,gz+dz);if(g&&clear(p,points.get(g))){connect(id,g);connect(g,id);}}}
    if(clear(start,end))connect('s','t');
    const anchor=[Math.round((start[0]+end[0])/512)*256,0,Math.round((start[2]+end[2])/512)*256],open=new Set(['s']),cost=new Map([['s',0]]),previous=new Map();
    while(open.size){let id,best=Infinity;for(const candidate of open){const score=cost.get(candidate)+distance(points.get(candidate),end);if(score<best){best=score;id=candidate;}}open.delete(id);if(id==='t'){const route=[];let at='t';while(at!=='s'){const step=previous.get(at);route.push({a:points.get(step.id),b:points.get(at),span:step.span});at=step.id;}return route.reverse();}
      const edges=[...(extra.get(id)||[])];if(id.startsWith('g:')){const [,x,z]=id.split(':').map(Number);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){if(!dx&&!dz)continue;const g=grid(x+dx,z+dz);if(!g)continue;const stamp=[id,g].sort().join('|');let ok=links.get(stamp);if(ok===undefined){ok=clear(points.get(id),points.get(g));links.set(stamp,ok);}if(ok)edges.push({id:g});}}
      for(const edge of edges){const next=cost.get(id)+distance(points.get(id),points.get(edge.id))+(edge.span?90+distance(edge.span.points[Math.floor(edge.span.points.length/2)],anchor):0);if(next>=(cost.get(edge.id)??Infinity))continue;cost.set(edge.id,next);previous.set(edge.id,{id,span:edge.span});open.add(edge.id);}
    }
    return null;
  }
  function route(road){if(saved.has(road.id))return saved.get(road.id);if(cache.has(road.id))return cache.get(road.id);if(cache.size>2048)cache.clear();
    const first=road.points[0],last=road.points.at(-1),left=portal(junction(first)),right=portal(junction(last)),start=left.point,end=right.point;
    function finish(sections){if(left.section)sections.unshift(left.section);if(right.section)sections.push({...right.section,points:right.section.points.toReversed()});const points=sections.flatMap((s,i)=>s.points.slice(i?1:0)),result={...road,...(coastal?roadProfile(road.id):{width:16}),points,bridge:sections.some(s=>s.kind==='crossing'),sections};cache.set(road.id,result);return result;}
    const shifted=road.points.map((p,i)=>{const t=i/(road.points.length-1);return height([p[0]+(start[0]-first[0])*(1-t)+(end[0]-last[0])*t,0,p[2]+(start[2]-first[2])*(1-t)+(end[2]-last[2])*t]);});shifted[0]=start;shifted[shifted.length-1]=end;
    if(shifted.every((p,i)=>!i||clear(shifted[i-1],p)))return finish([{kind:'land',points:shifted}]);
    const steps=search(start,end,320)||search(start,end,512)||search(start,end,1024)||search(start,end,2048);if(!steps)throw new Error('No safe bridge route for '+road.id);
    const sections=[];let land=[start];
    function flush(){if(land.length<2)return;const simple=[land[0]];for(let i=0;i<land.length-1;){let j=land.length-1;while(j>i+1&&!clear(land[i],land[j]))j--;simple.push(land[j]);i=j;}const points=simple.slice(1).flatMap((p,i)=>samples(simple[i],p,8).slice(i?1:0).map(height));points[0]=land[0];points[points.length-1]=land.at(-1);sections.push({kind:'land',points});}
    for(const step of steps){if(step.span){flush();sections.push(step.span);land=[step.b];}else land.push(step.b);}flush();
    return finish(sections);
  }
  return {route,sites};
}
