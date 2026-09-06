import {roadGraph} from './road-graph.mjs';

const key=p=>p.map(v=>Math.round(v*100)).join(',');
export function buildRoadNetwork(routes){
  routes=[...routes].sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const {nodes,edges}=roadGraph(routes),used=new Set(),roads=[],bridges=new Map();
  for(const route of routes)for(const section of route.sections||[])if(section.kind==='crossing'&&!bridges.has(section.id)){
    const reverse=key(section.points[0])>key(section.points.at(-1)),points=reverse?section.points.toReversed():section.points;
    const span=reverse?{...section,points,deckStart:points.length-1-section.deckEnd,deckEnd:points.length-1-section.deckStart}:section;
    bridges.set(section.id,{id:section.id,width:span.width||route.width,class:route.class||'arterial',bridge:true,archVersion:route.archVersion,points,sections:[span]});
  }
  function stop(node,width){return node.arms.length!==2||node.arms.some(a=>a.edge.bridge||a.edge.width!==width);}
  function walk(start,first){
    const points=[start.p],width=first.width;let node=start,edge=first;
    while(edge&&!used.has(edge)){used.add(edge);node=edge.a===node?edge.b:edge.a;points.push(node.p);if(stop(node,width))break;edge=node.arms.find(a=>a.edge!==edge)?.edge;}
    if(points.length<2)return;
    if(key(points[0])>key(points.at(-1)))points.reverse();
    roads.push({id:'network:'+key(points[0])+':'+key(points[1])+':'+key(points.at(-1))+':'+width,width,class:width>=28?'arterial':width>=18?'collector':'local',points,bridge:false,sections:[{kind:'land',width,points}]});
  }
  for(const node of nodes.values())for(const {edge} of node.arms)if(!edge.bridge&&!used.has(edge)&&stop(node,edge.width))walk(node,edge);
  for(const edge of edges.values())if(!edge.bridge&&!used.has(edge))walk(edge.a,edge);
  return [...roads,...bridges.values()].sort((a,b)=>a.id.localeCompare(b.id));
}
