import test from 'node:test';
import assert from 'node:assert/strict';
test('turn arrow heads face upward on every junction approach',()=>{
  const roads=[{id:'x',width:28,points:[[-150,4,0],[150,4,0]]},{id:'z',width:28,points:[[0,4,-150],[0,4,150]]}];
  const {arrows}=roadMarkings(roads);assert.ok(arrows.length>0);
  for(const q of arrows)for(const [i,j,k] of [[0,1,3],[1,2,3]]){
    const a=q[i],b=q[j],c=q[k],normalY=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
    assert.ok(normalY>0,'Arrow triangle must be visible from above');
  }
});
import {roadMarkings} from '../src/road-markings.mjs';
const road=(id,points,width=10)=>({id,points,width});

test('both sidewalks have regularly spaced lights even on densely sampled roads',()=>{
  const points=Array.from({length:101},(_,i)=>[i*2,4,0]);
  const result=roadMarkings([road('a',points)]);
  for(const side of [-1,1]){
    const lamps=result.furniture.filter(v=>v.p[2]*side>0);
    assert.equal(lamps.length,4);assert.ok(lamps.every(v=>Math.abs(v.p[2])===8));
    const positions=lamps.map(v=>v.p[0]).sort((a,b)=>a-b);
    assert.ok(positions.slice(1).every((x,i)=>Math.abs(x-positions[i]-48)<1e-6));
  }
});

test('bridge approaches omit junction decorations but retain lane lines and sidewalk lamps',()=>{
  const bridge={...road('a',[[-100,8,0],[100,8,0]]),sections:[{kind:'crossing',points:[[-100,8,0],[100,8,0]]}]};
  const result=roadMarkings([bridge,road('b',[[0,8,-100],[0,8,100]])]);
  assert.equal(result.crosswalks,2);
  for(const polygon of [...result.white,...result.stops,...result.arrows])assert.ok(polygon.every(p=>Math.abs(p[2])>5));
  assert.ok(result.yellow.length);assert.ok(result.furniture.some(v=>v.p[1]===8&&Math.abs(v.p[2])===8));
});
test('overlapping parallel corridors use one marking layout with stable ownership',()=>{
  const main=road('main',[[-100,4,0],[100,4,0]],28),other=road('side',[[-100,4,2],[100,4,2]],18);
  const single=roadMarkings([main]),both=roadMarkings([main,other]);
  assert.deepEqual(both.yellow,single.yellow);assert.deepEqual(both.lanes,single.lanes);
  assert.deepEqual(roadMarkings([other,main]),both);
  const elevated=roadMarkings([main,road('upper',[[-100,12,2],[100,12,2]],18)]);
  assert.equal(elevated.yellow.length,4);
  const separate=roadMarkings([main,road('parallel',[[-100,4,40],[100,4,40]],18)]);
  assert.equal(separate.yellow.length,4);
});
test('only the shared portion loses secondary markings',()=>{
  const result=roadMarkings([road('main',[[-50,4,0],[50,4,0]],28),road('side',[[-100,4,2],[100,4,2]],18)]);
  const secondary=result.yellow.filter(q=>q.every(p=>p[2]>1));
  assert.ok(secondary.length>0);
  assert.ok(secondary.every(q=>q.every(p=>p[0]<=-50.0001+.001)||q.every(p=>p[0]>=49.9999-.001)));
});
test('overlapping approaches do not duplicate crossings or street furniture',()=>{
  const result=roadMarkings([road('a',[[-100,4,0],[100,4,0]],28),road('b',[[-100,4,2],[100,4,2]],18),road('c',[[0,4,0],[0,4,100]],18)]);
  assert.equal(result.crosswalks,3);assert.ok(result.furniture.length>3);
  for(const lamp of result.furniture)for(const other of result.furniture)if(lamp!==other)assert.ok(Math.hypot(lamp.p[0]-other.p[0],lamp.p[2]-other.p[2])>=12);
});

test('short links between nearby junctions do not receive competing approach markings',()=>{
  const roads=[road('main',[[-100,4,0],[100,4,0]],18),road('a',[[0,4,-100],[0,4,0]],10),road('b',[[25,4,0],[25,4,100]],10)];
  const result=roadMarkings(roads);assert.equal(result.junctions.length,2);assert.equal(result.crosswalks,4);
  for(const q of result.arrows)for(const p of q)assert.ok(!(p[0]>0&&p[0]<25&&Math.abs(p[2])<9));
});

test('acute approaches do not enlarge every mouth and broad roads have traffic markings',()=>{
  const roads=[road('main',[[-150,4,0],[150,4,0]],28),road('branch',[[0,4,0],[120,4,65]],10),road('south',[[0,4,0],[0,4,-150]],18)];
  const result=roadMarkings(roads),patch=result.patches[0];
  assert.ok(patch.approaches.length===4);
  assert.ok(Math.max(...patch.approaches.map(a=>a.setback))-Math.min(...patch.approaches.map(a=>a.setback))>10);
  assert.ok(result.lanes.length>0);assert.ok(result.stops.length===4);assert.ok(result.arrows.length>0);
  for(const q of [...result.lanes,...result.stops,...result.arrows])for(const p of q)assert.ok(p.every(Number.isFinite));
});

test('skew junctions share a filled footprint and move crossings past the corners',()=>{
  const roads=[road('a',[[-100,4,0],[100,4,0]],16),road('b',[[-80,4,-60],[80,4,60]],10)];
  const result=roadMarkings(roads);
  assert.equal(result.crosswalks,4);
  assert.equal(result.patches.length,1);
  const patch=result.patches[0];assert.ok(patch.radius>20);
  assert.ok(patch.road.length>=4);assert.ok(patch.walk.length>=4);
  for(const p of [...patch.road,...patch.walk])assert.ok(p.every(Number.isFinite));
  for(const q of result.white){const center=q.reduce((a,p)=>a.map((v,i)=>v+p[i]/4),[0,0,0]);assert.ok(Math.hypot(center[0],center[2])>patch.radius-5);}
});

test('oblique three-way crossings do not overlap each other',()=>{
  const result=roadMarkings([road('main',[[-100,4,0],[0,4,0],[100,4,15]],16),road('branch',[[0,4,0],[-55,4,-100]],12)]);
  assert.equal(result.crosswalks,3);assert.equal(result.patches.length,1);
  const separated=(a,b)=>[a,b].some(q=>q.some((p,i)=>{const next=q[(i+1)%q.length],nx=next[2]-p[2],nz=p[0]-next[0],project=r=>r.map(v=>v[0]*nx+v[2]*nz),u=project(a),v=project(b);return Math.max(...u)<=Math.min(...v)+1e-7||Math.max(...v)<=Math.min(...u)+1e-7;}));
  for(let i=0;i<result.white.length;i++)for(let j=i+1;j<result.white.length;j++){
    assert.ok(separated(result.white[i],result.white[j]));
  }
});
test('sloping crossroads have four zebra crossings and interrupted double yellow lines',()=>{
  const result=roadMarkings([road('a',[[-60,0,0],[60,1.2,0]]),road('b',[[0,.6,-60],[0,.6,60]])]);
  assert.equal(result.junctions.length,1);assert.equal(result.crosswalks,4);
  assert.ok(result.yellow.length>=8);assert.ok(result.white.length>0);
  for(const quad of result.yellow)for(const p of quad)assert.ok(Math.hypot(p[0],p[2])>=10);
  for(const quad of result.white.filter(q=>q.every(p=>Math.abs(p[2])<5)))for(const p of quad)assert.ok(Math.abs(p[1]-(p[0]+60)*.01)<1e-6);
  const horizontal=result.yellow.filter(q=>q.every(p=>Math.abs(p[2])<1));
  for(const quad of horizontal)for(const p of quad)assert.ok(Math.abs(p[1]-(p[0]+60)*.01)<1e-6);
});
test('bends, shared duplicate roads and grade separated crossings do not create zebra crossings',()=>{
  const bend=road('a',[[-60,0,0],[0,0,0],[0,0,60]]);
  assert.equal(roadMarkings([bend,{...bend,id:'copy'}]).crosswalks,0);
  assert.equal(roadMarkings([road('a',[[-60,0,0],[60,0,0]]),road('b',[[0,8,-60],[0,8,60]])]).crosswalks,0);
});
test('densely sampled sections and legacy roads produce the same junction markings',()=>{
  const points=Array.from({length:61},(_,i)=>[i*2-60,0,0]);
  const roads=[road('a',points),road('b',[[0,0,-60],[0,0,60]])];
  const result=roadMarkings(roads);assert.equal(result.crosswalks,4);
  assert.deepEqual(roadMarkings(roads.map(r=>({...r,sections:[{kind:'land',points:r.points}]}))),result);
});
