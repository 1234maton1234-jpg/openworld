import {createStore} from '../server/store.mjs';
import {roadGraph} from '../shared/road-graph.mjs';
import {buildRoadNetwork} from '../shared/road-network.mjs';
import {archRoad} from '../shared/bridge-arch.mjs';
import assert from 'node:assert/strict';

const store=(await createStore(':memory:')),reports=[];
try{
  for(const [x,z] of [[0,0],[16,0],[280,288],[288,296],[-16,-8]]){
    const plan=(await store.planner.around(x,z)),roads=plan.roads,bridges=roads.filter(r=>r.bridge),ids=new Set(roads.map(r=>r.id));assert.equal(ids.size,roads.length);
    const raw=[...new Map(plan.regions.flatMap(r=>r.roads).map(r=>[r.id,r])).values()].map(archRoad),normalized=buildRoadNetwork(raw);
    assert.deepEqual(normalized,buildRoadNetwork(raw.toReversed()));
    const rawLength=raw.reduce((sum,r)=>sum+r.points.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-r.points[i][0],p[2]-r.points[i][2]),0),0);
    const length=normalized.reduce((sum,r)=>sum+r.points.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-r.points[i][0],p[2]-r.points[i][2]),0),0);
    assert.ok(length<=rawLength+.1);
    const graph=roadGraph(roads);let segments=0;
    for(const r of roads)for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],span=Math.hypot(a[0]-b[0],a[2]-b[2]);assert.ok(span>.001);assert.ok(Math.abs(a[1]-b[1])/span<.051);segments++;}
    reports.push({x,z,roads:roads.length,bridges:bridges.length,segments,uniqueEdges:graph.edges.size,duplicateLengthRemoved:Math.round(rawLength-length)});
  }
  console.log(JSON.stringify(reports,null,2));
}finally{(await store.close());}
