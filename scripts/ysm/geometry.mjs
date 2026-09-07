import * as T from 'three';

const rad=Math.PI/180,zero=[0,0,0];
const rotations=v=>[-v[0]*rad,-v[1]*rad,v[2]*rad];
function transform(pivot=zero,rotation=zero){const p=new T.Vector3(-pivot[0]/16,pivot[1]/16,pivot[2]/16);return new T.Matrix4().makeTranslation(...p).multiply(new T.Matrix4().makeRotationFromEuler(new T.Euler(...rotations(rotation),'ZYX'))).multiply(new T.Matrix4().makeTranslation(...p.clone().negate()));}

// Coordinate and face conventions follow OpenYSM YSMFolderDeserializer (MIT).
export function readGeometry(json){
  const geo=json['minecraft:geometry']?.[0];if(!geo?.bones)throw Error('Expected Bedrock / GeckoLib geometry');
  const tw=geo.description.texture_width,th=geo.description.texture_height;
  if(!(tw>0&&th>0)||geo.bones.length>4096)throw Error('Invalid geometry dimensions or bone count');
  return {textureWidth:tw,textureHeight:th,bones:geo.bones.map(b=>({name:b.name,parentName:b.parent||'',pivot:[-(b.pivot?.[0]||0),b.pivot?.[1]||0,b.pivot?.[2]||0],rotation:rotations(b.rotation||zero),cubes:(b.cubes||[]).map(c=>{
    const [ox,oy,oz]=c.origin,[w,h,d]=c.size,i=c.inflate??b.inflate??0,mirror=c.mirror??b.mirror??false;
    const x=(-ox-w-i)/16,y=(oy-i)/16,z=(oz-i)/16,X=x+(w+2*i)/16,Y=y+(h+2*i)/16,Z=z+(d+2*i)/16;
    const points=[[x,y,z],[x,y,Z],[x,Y,z],[x,Y,Z],[X,y,z],[X,y,Z],[X,Y,z],[X,Y,Z]],matrix=transform(c.pivot,c.rotation);
    let uv=c.uv;
    if(Array.isArray(uv)){const [u,v]=uv,dx=Math.floor(w),dy=Math.floor(h),dz=Math.floor(d),face=(a,b,c,d)=>({uv:[a,b],uv_size:[c,d]});uv={north:face(u+dz,v+dz,dx,dy),south:face(u+dz+dx+dz,v+dz,dx,dy),east:face(u,v+dz,dz,dy),west:face(u+dz+dx,v+dz,dz,dy),up:face(u+dz,v,dx,dz),down:face(u+dz+dx,v+dz,dx,-dz)};}
    const faces=[];
    for(const [name,indices,normal] of [['west',[3,2,0,1],[-1,0,0]],['east',[6,7,5,4],[1,0,0]],['north',[2,6,4,0],[0,0,-1]],['south',[7,3,1,5],[0,0,1]],['up',[3,7,6,2],[0,1,0]],['down',[0,4,5,1],[0,-1,0]]]){
      const field=mirror&&name==='west'?'east':mirror&&name==='east'?'west':name,f=uv?.[field];if(!f)continue;
      if(f.uv_rotation)throw Error('Rotated face UVs are not supported in this preview');
      const [u,v]=f.uv,[uw,vh]=f.uv_size||(['up','down'].includes(name)?[w,d]:['east','west'].includes(name)?[d,h]:[w,h]);
      let u0=u/tw,u1=(u+uw)/tw;if(!mirror)[u0,u1]=[u1,u0];
      faces.push({positions:indices.map(j=>new T.Vector3(...points[j]).applyMatrix4(matrix).toArray()),normal:new T.Vector3(...normal).transformDirection(matrix).toArray(),u:[u0,u1,u1,u0],v:[v/th,v/th,(v+vh)/th,(v+vh)/th]});
    }
    return {faces};
  })}))};
}

function channel(value){
  if(value===undefined)return [];
  const vector=v=>Array.isArray(v)?v:[v,v,v];
  const entries=typeof value==='object'&&!Array.isArray(value)?Object.entries(value):[['0',value]];
  return entries.map(([time,v])=>({timestamp:Number(time),interpolationMode:v?.lerp_mode==='catmullrom'?2:0,postData:vector(v?.post??v?.pre??v),preData:vector(v?.pre??v?.post??v),hasPreData:!!v?.pre})).sort((a,b)=>a.timestamp-b.timestamp);
}
export function readAnimations(json){return Object.entries(json.animations||{}).map(([name,a])=>{
  const bones=Object.entries(a.bones||{}).map(([boneName,b])=>({boneName,rotation:channel(b.rotation),position:channel(b.position),scale:channel(b.scale)}));
  const end=Math.max(0,...bones.flatMap(b=>['rotation','position','scale'].flatMap(k=>b[k].map(f=>f.timestamp))));
  return {name,length:a.animation_length??end,loopMode:a.loop===true?1:a.loop==='hold_on_last_frame'?3:0,boneAnimations:bones};
});}
const numeric=values=>Array.isArray(values)&&values.length===3&&values.every(v=>typeof v==='number'&&Number.isFinite(v));
export function animationSupported(a){return Number.isFinite(a.length)&&a.length>=0&&(a.boneAnimations||[]).every(b=>['rotation','position','scale'].every(k=>(b[k]||[]).every(f=>Number.isFinite(f.timestamp)&&numeric(f.postData)&&(!f.hasPreData||numeric(f.preData)))));}
export function sampleChannel(frames,time,fallback){
  if(!frames?.length)return fallback;
  if(time<frames[0].timestamp)return frames[0].hasPreData?frames[0].preData:frames[0].postData;
  let i=0;while(i+1<frames.length&&frames[i+1].timestamp<=time)i++;
  const a=frames[i],b=frames[i+1];if(!b)return a.postData;
  const t=(time-a.timestamp)/(b.timestamp-a.timestamp),end=b.hasPreData?b.preData:b.postData;
  if(a.interpolationMode===2||b.interpolationMode===2){const before=frames[Math.max(0,i-1)].postData,after=frames[Math.min(frames.length-1,i+2)].postData;return a.postData.map((v,k)=>.5*((2*v)+(-before[k]+end[k])*t+(2*before[k]-5*v+4*end[k]-after[k])*t*t+(-before[k]+3*v-3*end[k]+after[k])*t*t*t));}
  return a.postData.map((v,k)=>v+(end[k]-v)*t);
}
export function buildModel(geometry,material){
  if(!geometry?.bones?.length||geometry.bones.length>4096)throw Error('Missing geometry or too many bones');
  const root=new T.Group(),bones=new Map();let triangles=0;
  for(const b of geometry.bones){if(!b.name||bones.has(b.name))throw Error('Duplicate or missing bone name');bones.set(b.name,{data:b,node:new T.Group()});}
  for(const {data:b,node} of bones.values()){
    const seen=new Set([b.name]);let name=b.parentName;
    while(name){if(seen.has(name))throw Error('Cyclic bone hierarchy');seen.add(name);const parent=bones.get(name);if(!parent)throw Error('Missing parent bone: '+name);name=parent.data.parentName;}
    node.matrixAutoUpdate=false;(bones.get(b.parentName)?.node||root).add(node);
    const positions=[],normals=[],uv=[];
    for(const cube of b.cubes||[])for(const f of cube.faces){
      triangles+=2;if(triangles>100000)throw Error('Preview limit: 100000 triangles');
      for(const j of [0,1,2,0,2,3]){positions.push(...f.positions[j]);normals.push(...f.normal);uv.push(f.u[j],f.v[j]);}
    }
    if(positions.length){if(![...positions,...normals,...uv].every(Number.isFinite))throw Error('Invalid geometry coordinates');const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));node.add(new T.Mesh(geo,material));}
  }
  function update(animation,time){
    const tracks=new Map((animation?.boneAnimations||[]).map(b=>[b.boneName,b]));
    if(animation){if(animation.loopMode===1&&animation.length>0)time%=animation.length;else time=Math.min(time,animation.length);}
    for(const [name,{data:b,node}] of bones){
      const track=tracks.get(name),p=b.pivot.map(v=>v/16),translation=sampleChannel(track?.position,time,zero),rotation=sampleChannel(track?.rotation,time,zero),scale=sampleChannel(track?.scale,time,[1,1,1]);
      const r=rotations(rotation).map((v,i)=>v+(b.rotation?.[i]||0));
      node.matrix.makeTranslation(p[0]-translation[0]/16,p[1]+translation[1]/16,p[2]+translation[2]/16).multiply(new T.Matrix4().makeRotationFromEuler(new T.Euler(...r,'ZYX'))).multiply(new T.Matrix4().makeScale(...scale)).multiply(new T.Matrix4().makeTranslation(-p[0],-p[1],-p[2]));node.matrixWorldNeedsUpdate=true;
    }
    root.updateMatrixWorld(true);
  }
  update(null,0);return {root,bones,triangles,update,dispose(){root.traverse(o=>o.geometry?.dispose());}};
}
