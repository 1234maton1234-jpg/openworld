import {SIDEWALK_WIDTH,CURB_HEIGHT} from '../shared/street-style.mjs';
import {streetMaterial} from './street-materials.mjs';
import {streetLampGeometry} from './street-lamp.mjs';
import {unpackCityMeshes} from './city-mesh-transfer.mjs';
import {createStreetCollision} from './street-collision.mjs';
import {grassMaterial} from './grass-material.mjs';
import {curbSkirt} from './curb-skirt.mjs';
import {subtractConvex,sameLevelCut} from './road-clipping.mjs';
import {createWorldHydrology} from '../shared/coastal-hydrology.mjs';
import {createUrbanTerrain} from '../shared/urban-terrain.mjs';
import * as THREE from 'three';
import {roadMarkings,junctionHeight} from './road-markings.mjs';
import {plotPolygon} from '../shared/polygon-land.mjs';
import {groundHeight,lotAtPoint} from '../shared/city-plan.mjs';
import {sampleTime} from './time-of-day.mjs';
export function createCityView(scene,invalidate=()=>{},{background=true}={}){
  let worker=background&&typeof Worker==='function'?new Worker('/road-markings-worker.js',{type:'module'}):null,requested=null,busy=false,prepared=null;
  function dispatch(){if(busy||!requested||!worker)return;busy=true;const {id,x,z,plan,values}=requested;worker.postMessage({id,x,z,plan,values});}
  if(worker){worker.onmessage=({data})=>{busy=false;if(data.error){worker.terminate();worker=null;const p=requested;if(p)rebuild(p.x,p.z,p.plan,p.values);return;}if(data.id!==requested?.id){dispatch();return;}prepared=data;const p=requested;rebuild(p.x,p.z,p.plan,p.values);};worker.onerror=()=>{worker.terminate();worker=null;busy=false;const p=requested;if(p)rebuild(p.x,p.z,p.plan,p.values);};}
  let junctionPatches=[],meshOrigin={x:0,z:0};
  const streetCollision=createStreetCollision();let lampPositions=[];
  const group=new THREE.Group();scene.add(group);let planning={lots:[],roads:[],parks:[],legacy:[]},rows=[],origin={x:0,z:0},key='',hydrology,hydrologyKey='',field;
  const roadMat=streetMaterial('asphalt'),walkMat=streetMaterial('sidewalk'),padMat=grassMaterial(),freeMat=new THREE.LineBasicMaterial({color:'#719178'}),ownedMat=new THREE.LineBasicMaterial({color:'#485f71'});
  for(const [material,offset] of [[roadMat,-4],[walkMat,-2],[padMat,-1]]){material.polygonOffset=true;material.polygonOffsetFactor=offset;material.polygonOffsetUnits=offset;}
  const bridgeMat=new THREE.MeshStandardMaterial({color:'#92908a',roughness:.94}),railMat=new THREE.MeshStandardMaterial({color:'#45494b',roughness:.48,metalness:.65});
  const yellowMat=new THREE.MeshStandardMaterial({color:'#f4c52f',roughness:1}),whiteMat=new THREE.MeshStandardMaterial({color:'#f5f4ed',roughness:1});
  for(const material of [yellowMat,whiteMat]){material.polygonOffset=true;material.polygonOffsetFactor=-6;material.polygonOffsetUnits=-6;}
  function pave(mesh){if(mesh.material!==walkMat&&mesh.material!==roadMat&&mesh.material!==padMat)return;mesh.updateMatrix();const positions=mesh.geometry.attributes.position,uv=new Float32Array(positions.count*2),p=new THREE.Vector3(),scale=mesh.material===padMat?4:2;for(let i=0;i<positions.count;i++){p.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrix);uv[i*2]=(p.x+origin.x*70)/scale;uv[i*2+1]=(p.z+origin.z*70)/scale;}mesh.geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));mesh.userData.sidewalk=mesh.material===walkMat;}
  function markings(result){for(const [quads,material,kind] of [[result.yellow,yellowMat,'double-yellow'],[[...result.white,...result.lanes,...result.stops,...result.arrows],whiteMat,'crosswalk']]){if(!quads.length)continue;const vertices=[],indices=[];for(const quad of quads){const k=vertices.length/3;for(const p of quad)vertices.push(p[0]-origin.x*70,p[1]+.045,p[2]-origin.z*70);indices.push(k,k+1,k+3,k+1,k+2,k+3);}const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,material);mesh.userData.roadMarking=kind;group.add(mesh);}}
  const poleMat=new THREE.MeshStandardMaterial({color:'#52575b',roughness:.42,metalness:.6}),lampMat=new THREE.MeshStandardMaterial({color:'#eee9dc',emissive:'#ffe3ab',emissiveIntensity:.45,roughness:.35});
  const nearbyLights=[];let lightSelection=[],lightSource=null,lightX=Infinity,lightZ=Infinity;
  function updateLights(camera){
    if(!camera)return;
    if(!nearbyLights.length)for(let i=0;i<6;i++){const light=new THREE.PointLight('#ffe1ae',0,28,2);scene.add(light);nearbyLights.push(light);}
    const [h,m]=(document.body.dataset.time||'12:00').split(':').map(Number),night=sampleTime(h+m/60).night;
    lampMat.emissiveIntensity=.45+night*5;
    const x=camera.position.x+origin.x*70,z=camera.position.z+origin.z*70;
    if(lightSource!==lampPositions||Math.hypot(x-lightX,z-lightZ)>5){lightSource=lampPositions;lightX=x;lightZ=z;lightSelection=lampPositions.map(lamp=>({lamp,d:(lamp.p[0]-x)**2+(lamp.p[2]-z)**2})).filter(item=>item.d<65**2).sort((a,b)=>a.d-b.d).slice(0,6).map(item=>item.lamp);}
    nearbyLights.forEach((light,i)=>{const lamp=lightSelection[i];if(!lamp){light.intensity=0;return;}const {p,angle}=lamp;light.position.set(p[0]-origin.x*70+Math.cos(angle)*1.3,p[1]+CURB_HEIGHT+7.9,p[2]-origin.z*70-Math.sin(angle)*1.3);light.intensity=night*1200;});
  }
  function streetLights(items){
    lampPositions=items;streetCollision.set(items);
    const lamps=items;
    if(!lamps.length)return;
    const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
    const geometries=streetLampGeometry();
    for(const [index,material] of [poleMat,lampMat].entries()){
      const mesh=new THREE.InstancedMesh(geometries[index],material,lamps.length);
      lamps.forEach(({p,angle},i)=>{rotation.setFromAxisAngle(up,angle);matrix.compose(new THREE.Vector3(p[0]-origin.x*70,p[1]+CURB_HEIGHT,p[2]-origin.z*70),rotation,new THREE.Vector3(1,1,1));mesh.setMatrixAt(i,matrix);});
      mesh.instanceMatrix.needsUpdate=true;mesh.userData.streetLight=true;mesh.receiveShadow=true;group.add(mesh);
    }
  }
  function junctionMesh(patch,ring,material,lift){
    const points=[patch.center,...ring],vertices=points.flatMap(p=>[p[0]-origin.x*70,p[1]+lift,p[2]-origin.z*70]),indices=[];
    for(let i=0;i<ring.length;i++)indices.push(0,(i+1)%ring.length+1,i+1);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material);mesh.userData.junctionSurface=true;mesh.receiveShadow=true;pave(mesh);group.add(mesh);
  }
  function trimSidewalks(){
    const cuts=junctionPatches.map(p=>({ring:p.road.map(v=>[v[0]-origin.x*70,v[1],v[2]-origin.z*70]),walk:p.walk.map(v=>[v[0]-origin.x*70,v[1],v[2]-origin.z*70]),height:p.center[1]}));
    const roadCuts=new Map(),point=new THREE.Vector3();
    for(const mesh of group.children.filter(o=>o.material===roadMat||o.userData.sidewalk&&!o.userData.plotEntrance)){
      mesh.updateMatrix();const {position}=mesh.geometry.attributes,index=mesh.geometry.index;
      for(let i=0;i<(index?index.count:position.count);i+=3){
        const ring=[0,1,2].map(j=>point.fromBufferAttribute(position,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrix).toArray());
        const a=ring[0],b=ring[1],c=ring[2],area=(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);if(Math.abs(area)<1e-6)continue;
        const cut={ring,sidewalk:mesh.material===walkMat,minY:Math.min(...ring.map(p=>p[1])),maxY:Math.max(...ring.map(p=>p[1]))};
        for(let x=Math.floor(Math.min(...ring.map(p=>p[0]))/64);x<=Math.floor(Math.max(...ring.map(p=>p[0]))/64);x++)for(let z=Math.floor(Math.min(...ring.map(p=>p[2]))/64);z<=Math.floor(Math.max(...ring.map(p=>p[2]))/64);z++){const key=x+','+z;if(!roadCuts.has(key))roadCuts.set(key,[]);roadCuts.get(key).push(cut);}
      }
    }
    for(const cut of cuts){cut.minX=Math.min(...cut.walk.map(p=>p[0]));cut.maxX=Math.max(...cut.walk.map(p=>p[0]));cut.minZ=Math.min(...cut.walk.map(p=>p[2]));cut.maxZ=Math.max(...cut.walk.map(p=>p[2]));}
    for(const mesh of group.children.filter(o=>o.userData.sidewalk)){
      mesh.updateMatrix();const geometry=mesh.geometry,pos=geometry.attributes.position,index=geometry.index,vertices=[],point=new THREE.Vector3();
      for(let i=0;i<(index?index.count:pos.count);i+=3){const triangle=[0,1,2].map(j=>point.fromBufferAttribute(pos,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrix).toArray());let pieces=[triangle];
        const minX=Math.min(...triangle.map(p=>p[0])),maxX=Math.max(...triangle.map(p=>p[0])),minZ=Math.min(...triangle.map(p=>p[2])),maxZ=Math.max(...triangle.map(p=>p[2]));
        for(const cut of cuts){if(maxX<cut.minX||minX>cut.maxX||maxZ<cut.minZ||minZ>cut.maxZ||Math.abs(triangle[0][1]-cut.height)>4)continue;pieces=pieces.flatMap(p=>subtractConvex(p,mesh.userData.junctionSurface?cut.ring:cut.walk));if(!pieces.length)break;}
        const nearby=new Set(),minY=Math.min(...triangle.map(p=>p[1])),maxY=Math.max(...triangle.map(p=>p[1]));
        for(let x=Math.floor(minX/64);x<=Math.floor(maxX/64);x++)for(let z=Math.floor(minZ/64);z<=Math.floor(maxZ/64);z++)for(const cut of roadCuts.get(x+','+z)||[])nearby.add(cut);
        for(const cut of nearby){if(!pieces.length)break;if(cut.sidewalk&&!mesh.userData.plotEntrance)continue;const below=mesh.userData.plotEntrance?CURB_HEIGHT+.15:.15;if(minY>cut.maxY+CURB_HEIGHT+.15||maxY<cut.minY-below)continue;const ring=sameLevelCut(cut.ring,triangle,-below,CURB_HEIGHT+.15);if(ring.length>=3)pieces=pieces.flatMap(p=>subtractConvex(p,ring));}
        for(const piece of pieces)for(let j=1;j<piece.length-1;j++){const a=piece[0].map(Math.fround),b=piece[j].map(Math.fround),c=piece[j+1].map(Math.fround),area=(b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]);if(Math.abs(area)>1e-6)vertices.push(...a,...(area<0?b:c),...(area<0?c:b));}
      }
      const next=new THREE.BufferGeometry();next.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));next.computeVertexNormals();geometry.dispose();mesh.geometry=next;mesh.position.set(0,0,0);mesh.rotation.set(0,0,0);mesh.scale.set(1,1,1);pave(mesh);
    }
  }
  function lotInfo(x,z){return rows.find(p=>p.x===x&&p.z===z)||planning.lots.find(p=>p.x===x&&p.z===z);}
  let foundations=[];
  function ground(x,z){return field?field.ground(x,z,foundations,planning.legacy,planning.roads):groundHeight(x,z,planning.legacy,hydrology);}
  function surface(x,z){const lot=lotAtPoint([...rows,...planning.lots],x,z);if(lot)return lot.elevation;
    const junction=junctionHeight(junctionPatches,x,z,CURB_HEIGHT);
    let nearest=Infinity,roadY,carriageway=false;
    for(const road of planning.roads)for(const path of road.sections||[road]){const width=path.width||road.width;for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i],dx=b[0]-a[0],dz=b[2]-a[2],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz)));const distance=Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t),asphalt=distance<=width/2;if(distance<=width/2+SIDEWALK_WIDTH&&((asphalt&&!carriageway)||(asphalt===carriageway&&distance<nearest))){nearest=distance;carriageway=asphalt;roadY=a[1]+(b[1]-a[1])*t+(asphalt?0:CURB_HEIGHT);}}}
    if(junction!==undefined&&!carriageway)return junction;
    if(roadY!==undefined)return roadY;
    return ground(x,z);
  }
  function ribbon(points,width,material,lift=0,depth=0){
    if(material===walkMat&&width>2*SIDEWALK_WIDTH){
      lift+=CURB_HEIGHT;
      const vertices=[],indices=[],offsets=[-width/2,-width/2+SIDEWALK_WIDTH,width/2-SIDEWALK_WIDTH,width/2];
      for(let i=0;i<points.length;i++){const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz)||1;
        for(const offset of offsets)vertices.push(p[0]-origin.x*70-dz/length*offset,p[1]+lift,p[2]-origin.z*70+dx/length*offset);
        if(i)for(const side of [0,2]){const k=i*4+side;indices.push(k-4,k-3,k,k-3,k+1,k);}
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
      const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;pave(mesh);group.add(mesh);return;
    }
const vertices=[],indices=[];for(let i=0;i<points.length;i++){const p=points[i],a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b[0]-a[0],dz=b[2]-a[2],n=Math.hypot(dx,dz)||1;for(const side of [-1,1])vertices.push(p[0]-origin.x*70-dz/n*width/2*side,p[1]+lift,p[2]-origin.z*70+dx/n*width/2*side);if(i){const k=i*2;indices.push(k-2,k-1,k,k-1,k+1,k);}}
    if(depth){const count=vertices.length/3;for(let i=0;i<count;i++)vertices.push(vertices[i*3],vertices[i*3+1]-depth,vertices[i*3+2]);for(let i=2;i<count;i+=2){indices.push(i-2,i,i+count,i-2,i+count,i-2+count,i-1,i-1+count,i+1+count,i-1,i+1+count,i+1,i-2+count,i+count,i-1+count,i-1+count,i+count,i+1+count);}indices.push(0,count,1,1,count,count+1,count-2,count-1,count*2-2,count-1,count*2-1,count*2-2);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();const mesh=new THREE.Mesh(g,material);mesh.receiveShadow=true;pave(mesh);group.add(mesh);
  }
  function support(p,width,height,depth,angle,material=bridgeMat){const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),material);mesh.position.set(p[0]-origin.x*70,p[1]-height/2,p[2]-origin.z*70);mesh.rotation.y=angle;mesh.castShadow=true;mesh.receiveShadow=true;pave(mesh);group.add(mesh);mesh.userData.bridgeStructure=true;}
  function roadCap(p,width){
    const nearby=[];
    for(const road of planning.roads)for(const path of road.sections||[road])for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],dx=b[0]-a[0],dz=b[2]-a[2],length2=dx*dx+dz*dz;if(length2<1e-8)continue;
      const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[2]-a[2])*dz)/length2));
      if(Math.hypot(p[0]-a[0]-t*dx,p[2]-a[2]-t*dz)<width+8&&Math.abs(a[1]+t*(b[1]-a[1])-p[1])<2)nearby.push({a,b,dx,dz,length2});
    }
    for(const [radius,material,lift] of [[width/2+SIDEWALK_WIDTH,walkMat,.004+CURB_HEIGHT],[width/2,roadMat,.016]]){
      const geometry=material===walkMat?new THREE.RingGeometry(width/2,radius,24):new THREE.CircleGeometry(radius,24);geometry.rotateX(-Math.PI/2);const pos=geometry.attributes.position;
      for(let i=0;i<pos.count;i++){const x=p[0]+pos.getX(i),z=p[2]+pos.getZ(i);let best=Infinity,y=p[1];
        for(const {a,b,dx,dz,length2} of nearby){const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/length2)),d=(x-a[0]-t*dx)**2+(z-a[2]-t*dz)**2;if(d<best){best=d;y=a[1]+t*(b[1]-a[1]);}}
        pos.setY(i,y-p[1]);
      }
      geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,material);mesh.position.set(p[0]-origin.x*70,p[1]+lift,p[2]-origin.z*70);mesh.userData.roadJoin=true;mesh.userData.surfaceLift=lift;mesh.receiveShadow=true;pave(mesh);group.add(mesh);
    }
  }
  function crossing(section,width){
    const points=section.points,deck=points.slice(section.deckStart,section.deckEnd+1),a=deck[0],b=deck.at(-1),dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),angle=Math.atan2(dx,dz),nx=-dz/length,nz=dx/length;
    ribbon(deck,width+2*SIDEWALK_WIDTH,bridgeMat,-.025,.9);
    for(const p of [a,b])support([p[0],p[1]-.04,p[2]],width+2*SIDEWALK_WIDTH,Math.max(1.2,p[1]-ground(p[0],p[2])+1),3,angle);
    if(length>70){const spans=Math.ceil(length/64);for(let i=1;i<spans;i++){const center=deck[Math.round(i/spans*(deck.length-1))];for(const side of [-1,1]){const p=[center[0]+nx*width*.3*side,center[1]-.9,center[2]+nz*width*.3*side];support(p,1.4,Math.max(1,p[1]-ground(p[0],p[2])+.3),2.5,angle);}}}
    const rails=points.slice(Math.max(0,section.deckStart-3),Math.min(points.length,section.deckEnd+4));
    for(const side of [-1,1]){const edge=rails.map(p=>[p[0]+nx*(width/2+SIDEWALK_WIDTH-.4)*side,p[1]+1.12+CURB_HEIGHT,p[2]+nz*(width/2+SIDEWALK_WIDTH-.4)*side]);ribbon(edge,.18,railMat,0,.16);ribbon(edge,.1,railMat,-.5,.1);for(let i=0;i<edge.length;i+=3)support(edge[i],.16,1.12,.16,angle,railMat);}
  }
  function rebuild(x,z,newPlanning,values,force=false){origin={x,z};planning=newPlanning||planning;const waterKey=JSON.stringify([planning.hydrology,planning.terrain]);if(waterKey!==hydrologyKey){hydrologyKey=waterKey;hydrology=planning.hydrology?createWorldHydrology(planning.hydrology):undefined;field=planning.terrain?createUrbanTerrain(planning.terrain.frozen,hydrology,planning.terrain):undefined;}rows=values.map(p=>({...p,width:p.width||64,depth:p.depth||64}));foundations=[...rows,...planning.lots.filter(p=>!rows.some(r=>r.x===p.x&&r.z===p.z))];const stamp=waterKey+':'+planning.regions?.map(r=>r.x+','+r.z+','+r.version).join('|')+':'+rows.map(r=>r.x+','+r.z+','+r.published).join('|');group.position.set((meshOrigin.x-x)*70,0,(meshOrigin.z-z)*70);if(!force&&stamp===key&&Math.max(Math.abs(x-meshOrigin.x),Math.abs(z-meshOrigin.z))<=3){requested=null;return;}
    const requestId=stamp+':'+x+','+z;
    if(worker&&prepared?.id!==requestId){requested={id:requestId,x,z,plan:planning,values,roads:planning.roads.filter(r=>r.points.some(p=>Math.abs(p[0]-x*70)<850&&Math.abs(p[2]-z*70)<850))};dispatch();return;}
    const readyMeshes=prepared?.id===requestId?prepared:null;const readyMarkings=prepared?.id===requestId?prepared.result:null;prepared=null;requested=null;key=stamp;meshOrigin={x,z};group.position.set(0,0,0);
    for(const child of [...group.children]){child.geometry.dispose();group.remove(child);}
    if(readyMeshes?.meshes){junctionPatches=readyMeshes.patches;lampPositions=readyMeshes.lamps||[];streetCollision.set(lampPositions);for(const mesh of unpackCityMeshes(readyMeshes.meshes,[roadMat,walkMat,padMat,freeMat,ownedMat,bridgeMat,railMat,yellowMat,whiteMat,poleMat,lampMat]))group.add(mesh);group.userData.backgroundBuildMs=readyMeshes.buildMs;invalidate();return;}
    const drawnCrossings=new Set(),caps=new Map(),visibleRoads=[];
    for(const road of planning.roads){if(!road.points.some(p=>Math.abs(p[0]-x*70)<850&&Math.abs(p[2]-z*70)<850))continue;
      visibleRoads.push(road);
      if(road.sections){for(const section of road.sections){if(section.kind==='crossing'){if(drawnCrossings.has(section.id))continue;drawnCrossings.add(section.id);crossing(section,section.width);}else{for(let i=0;i<section.points.length;i++){const p=section.points[i],a=section.points[i-1],b=section.points[i+1];if(!a||!b||((p[0]-a[0])*(b[0]-p[0])+(p[2]-a[2])*(b[2]-p[2]))/Math.hypot(p[0]-a[0],p[2]-a[2])/Math.hypot(b[0]-p[0],b[2]-p[2])<.97)caps.set(p[0]+','+p[2],{p,width:road.width});}}const width=section.width||road.width,material=roadMat;ribbon(section.points,width+2*SIDEWALK_WIDTH,walkMat);ribbon(section.points,width,material,.012);}continue;}
      ribbon(road.points,road.width+2*SIDEWALK_WIDTH,walkMat);ribbon(road.points,road.width,roadMat,.012);
      if(road.bridge){for(const side of [-1,1]){const rail=road.points.filter(p=>ground(p[0],p[2])<1);if(rail.length>1){const points=rail.map((p,i)=>{const a=rail[Math.max(0,i-1)],b=rail[Math.min(rail.length-1,i+1)],dx=b[0]-a[0],dz=b[2]-a[2],n=Math.hypot(dx,dz);return [p[0]-dz/n*(road.width/2+SIDEWALK_WIDTH-.4)*side,p[1]+.8,p[2]+dx/n*(road.width/2+SIDEWALK_WIDTH-.4)*side];});ribbon(points,.15,walkMat);}}}
    }
    const result=readyMarkings||roadMarkings(visibleRoads);junctionPatches=result.patches;
    for(const {p,width} of caps.values())if(!junctionPatches.some(j=>Math.abs(p[1]-j.center[1])<.1&&Math.hypot(p[0]-j.center[0],p[2]-j.center[2])<j.radius))roadCap(p,width);
    for(const patch of junctionPatches){junctionMesh(patch,patch.walk,walkMat,.02+CURB_HEIGHT);junctionMesh(patch,patch.road,roadMat,.03);}
    trimSidewalks();
    for(const top of group.children.filter(o=>o.userData.sidewalk)){const mesh=new THREE.Mesh(curbSkirt(top.geometry),bridgeMat);mesh.receiveShadow=true;mesh.userData.curb=true;group.add(mesh);}
    markings(result);streetLights(result.furniture);
    const lots=[...planning.lots.filter(p=>!rows.some(r=>r.x===p.x&&r.z===p.z)),...rows];
    for(const p of lots){if(Math.abs(p.cx-x*70)>750||Math.abs(p.cz-z*70)>750)continue;const poly=plotPolygon(p),shape=new THREE.Shape(poly.map(([px,pz])=>new THREE.Vector2(px-p.cx,p.cz-pz))),g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);const mesh=new THREE.Mesh(g,padMat);mesh.position.set(p.cx-x*70,p.elevation+.015,p.cz-z*70);mesh.receiveShadow=true;pave(mesh);group.add(mesh);
      const points=poly.map(([px,pz])=>new THREE.Vector3(px-x*70,p.elevation+.04,pz-z*70));group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),p.owner?ownedMat:freeMat));
    }
    invalidate();
  }
  return {updateLights,blocked:streetCollision.blocked,get lamps(){return lampPositions;},get materials(){return [roadMat,walkMat,padMat,freeMat,ownedMat,bridgeMat,railMat,yellowMat,whiteMat,poleMat,lampMat];},get patches(){return junctionPatches;},rebuild,ground,surface,lotInfo,pick(x,z){return lotAtPoint([...rows,...planning.lots],x,z);},get objects(){return group.children;},get planning(){return planning;}};
}
