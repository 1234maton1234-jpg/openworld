import {cityHeight as heightAt} from '../shared/city-plan.mjs';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createAtmosphere} from './atmosphere.mjs';
import {createTerrain} from './terrain-view.mjs';
import {SHOW_DEMO_CONTENT} from './demo-content.mjs';
import {PLOT,plotTerrain,MAX_COORDINATE,validCoordinate} from '../shared/terrain.mjs';
import {plotPolygon} from '../shared/polygon-land.mjs';
import {createBuildingCollision} from './building-collision.mjs';
import {collectInteractions,findInteraction,seatPosition} from './interactions.mjs';
import {createMouseLook} from './mouse-look.mjs';
import {createVehicles,VEHICLES} from './vehicles.mjs';
import {createAvatar,chasePosition} from './avatar.mjs';
import {walkFacing} from './walk-facing.mjs';
let avatarYaw=0,walkMoved=false;
import {createCockpit} from './cockpit.mjs';
import {createMultiplayer} from './multiplayer.mjs';

export function dispose(object){const geometries=new Set(),materials=new Set(),textures=new Set();object.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
export function createWorld({onSelect,onRegion,onError,onLandPoint,onLandMove}){
  const canvas=document.querySelector('#world'),renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(48,1,.1,1200);camera.position.set(155,125,195);camera.rotation.order='YXZ';
  const controls=new OrbitControls(camera,canvas);controls.target.set(0,0,0);controls.enableDamping=true;controls.minDistance=20;controls.maxDistance=310;controls.maxPolarAngle=Math.PI/2-.08;
  const sky=new THREE.HemisphereLight('#e9f1e4','#91a777',2),sun=new THREE.DirectionalLight('#fff0da',3);sun.position.set(-30,60,40);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-150,right:150,top:150,bottom:-150,near:.1,far:220});sun.shadow.normalBias=.15;scene.add(sky,sun);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(1500,1500),new THREE.MeshStandardMaterial({color:'#afc797',roughness:1}));ground.rotation.x=-Math.PI/2;scene.add(ground);
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const atmosphere=createAtmosphere({scene,sun,sky,ground,renderer,reducedMotion,invalidate(){}});atmosphere.setWorldOrigin(0,0);ground.position.y=-.15;
  const overviewFog=new THREE.Fog('#d6eef4',260,470);ground.visible=false;const terrain=createTerrain(scene,()=>{renderer.shadowMap.needsUpdate=true;}),models=new THREE.Group();scene.add(models);let origin={x:0,z:0},rows=[],planning=null,selected=null,town=null,walking=false,yaw=0,pitch=-.1,velocity=0,lastTime=0,lastRefresh=0,pointerStart=null,paused=false;
  const loaded=new Map(),pending=new Set(),loader=new GLTFLoader(),keys=new Set(),box=new THREE.Box3(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let desired=new Map(),lastTelemetry=0,ready=false,focusElevation=true;
  const outline=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#406b48'}));outline.visible=false;scene.add(outline);
  let landDrawing=false,draftPoints=[],draftColor='#d95b56',draftElevation,vertexDrag=null;
  const draftGroup=new THREE.Group();scene.add(draftGroup);
  let landView=null;
  function syncLandView(){
    if(landDrawing&&!landView){
      landView={offset:camera.position.clone().sub(controls.target),minPolar:controls.minPolarAngle,maxPolar:controls.maxPolarAngle,minAzimuth:controls.minAzimuthAngle,maxAzimuth:controls.maxAzimuthAngle,screenSpacePanning:controls.screenSpacePanning};
      controls.minPolarAngle=controls.maxPolarAngle=0;controls.minAzimuthAngle=controls.maxAzimuthAngle=0;controls.screenSpacePanning=true;
      camera.position.copy(controls.target).add(new THREE.Vector3(0,landView.offset.length(),0));
      const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;
    }else if(!landDrawing&&landView){
      endVertexDrag();controls.minPolarAngle=landView.minPolar;controls.maxPolarAngle=landView.maxPolar;controls.minAzimuthAngle=landView.minAzimuth;controls.maxAzimuthAngle=landView.maxAzimuth;controls.screenSpacePanning=landView.screenSpacePanning;
      if(!walking){camera.position.copy(controls.target).add(landView.offset);controls.update();}landView=null;
    }
  }
  function updateDraft(){for(const child of [...draftGroup.children]){draftGroup.remove(child);dispose(child);}if(!draftPoints.length)return;const y=draftElevation??Math.max(...draftPoints.map(([x,z])=>terrain.ground(x,z)))+.15;
    const points=draftPoints.map(([x,z])=>new THREE.Vector3(x-origin.x*70,y+.12,z-origin.z*70));
    draftGroup.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:draftColor,depthTest:false})));
    if(points.length>=3){const shape=new THREE.Shape(draftPoints.map(([x,z])=>new THREE.Vector2(x-origin.x*70,origin.z*70-z))),g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:draftColor,transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide}));mesh.position.y=y+.06;draftGroup.add(mesh);}
    for(const p of points){const marker=new THREE.Mesh(new THREE.SphereGeometry(1.2,8,6),new THREE.MeshBasicMaterial({color:draftColor,depthTest:false}));marker.position.copy(p);draftGroup.add(marker);}
  }
  function updateOutline(){const lot=selected&&terrain.lotInfo(selected.x,selected.z);outline.visible=!!lot;if(lot){outline.geometry.dispose();outline.geometry=new THREE.BufferGeometry().setFromPoints(plotPolygon(lot).map(([x,z])=>new THREE.Vector3(x-origin.x*70,lot.elevation+.15,z-origin.z*70)));}updateDraft();}

  function renderGrid(){
    terrain.rebuild(origin.x,origin.z,rows,planning);
    updateOutline();sun.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;
  }
  function place(object,row,metrics){object.position.set((row.cx-origin.x*PLOT.cell)-(metrics.min[0]+metrics.max[0])/2,row.elevation-metrics.min[1],(row.cz-origin.z*PLOT.cell)-(metrics.min[2]+metrics.max[2])/2);object.updateMatrixWorld(true);}
  function moveOrigin(x,z,reset){
    x=Math.max(-MAX_COORDINATE,Math.min(MAX_COORDINATE,x));z=Math.max(-MAX_COORDINATE,Math.min(MAX_COORDINATE,z));
    const dx=(x-origin.x)*PLOT.cell,dz=(z-origin.z)*PLOT.cell;origin={x,z};
    atmosphere.setWorldOrigin(x*PLOT.cell,z*PLOT.cell);
    camera.position.x-=dx;camera.position.z-=dz;controls.target.x-=dx;controls.target.z-=dz;
    vehicles.rebase();
    if(reset){focusElevation=true;const h=heightAt(x*PLOT.cell,z*PLOT.cell);camera.position.set(130,h+150,170);controls.target.set(0,h,0);controls.update();}
    for(const {object,row,metrics} of loaded.values())place(object,row,metrics);
    if(town)town.position.set(-x*PLOT.cell,town.position.y,-z*PLOT.cell);
    renderGrid();onRegion({...origin});
  }
  function refreshBuildings(){
    desired=new Map(rows.filter(r=>r.published).sort((a,b)=>Math.hypot(a.x-origin.x,a.z-origin.z)-Math.hypot(b.x-origin.x,b.z-origin.z)).slice(0,16).map(r=>[r.published,r]));
    for(const [id,value] of loaded)if(!desired.has(id)){models.remove(value.object);dispose(value.object);loaded.delete(id);}
    for(const [id,row] of desired){
      if(loaded.has(id)||pending.has(id))continue;pending.add(id);
      fetch('/assets/'+id+'.glb').then(async response=>{if(!response.ok)throw new Error('Model load failed');const bytes=await response.arrayBuffer(),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');return {gltf:await loader.parseAsync(bytes,''),hash};}).then(({gltf,hash})=>{
        if(!desired.has(id)){dispose(gltf.scene);return;}
        const object=gltf.scene,metrics=JSON.parse(row.metrics);object.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});place(object,row,metrics);models.add(object);loaded.set(id,{object,row,metrics,collision:createBuildingCollision(object),interactions:collectInteractions(object,hash)});renderer.shadowMap.needsUpdate=true;
      }).catch(()=>onError('一栋建筑加载失败，将在下次刷新时重试')).finally(()=>pending.delete(id));
    }
  }
  if(SHOW_DEMO_CONTENT)loader.loadAsync('/demo-town.glb').then(gltf=>{town=gltf.scene;town.scale.setScalar(1.35);town.updateMatrixWorld(true);box.setFromObject(town);const y=4.15-box.min.y;town.position.set(-origin.x*PLOT.cell,y,-origin.z*PLOT.cell);town.traverse(o=>{if(o.isLight)o.visible=false;if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(town);atmosphere.registerTown(town);terrain.registerTown(town);}).catch(()=>onError('公共示范小镇未能载入，地块功能仍可使用'));
  function floorAt(x,z){let h=terrain.surface(origin.x*PLOT.cell+x,origin.z*PLOT.cell+z);const limit=walking?camera.position.y-1.7+.8:h+.8;for(const {collision} of loaded.values())h=Math.max(h,collision.surface(x,z,limit));return h;}
  function blocked(x,z,y){const h=floorAt(x,z);if(terrain.blocked(origin.x*70+x,origin.z*70+z,y-1.7)||h<.5||h>y-1.7+.8||vehicles.blocks(origin.x*70+x,origin.z*70+z))return true;for(const {collision} of loaded.values())if(collision.blocked(x,z,y-1.7))return true;return false;}
  const vehicles=createVehicles(scene,{origin:()=>origin,surface:(x,z)=>{let h=terrain.surface(x,z);const limit=h+.45;for(const v of loaded.values())h=Math.max(h,v.collision.surface(x-origin.x*70,z-origin.z*70,limit));return h;},obstacle:(x,z,h,r)=>terrain.blocked(x,z,h,r)||[...loaded.values()].some(v=>v.collision.blocked(x-origin.x*70,z-origin.z*70,h,r))});
  function look(dx,dy){if(vehicles.active){vehicles.look(dx,dy);return;}yaw-=dx*.0025;pitch=THREE.MathUtils.clamp(pitch-dy*.0025,-1.4,1.4);camera.rotation.set(pitch,yaw,0);}
  const mouseLook=createMouseLook(look);
  const avatar=createAvatar(scene),cockpit=createCockpit(),viewCamera=camera.clone(),viewRay=new THREE.Raycaster();let thirdPerson=false;
  const multiplayer=createMultiplayer(scene,{origin:()=>origin,onError});
  let avatarUrl=null,avatarLoading=false,lastAvatarSync=-15000;
  async function syncAvatar(){if(avatarLoading)return;avatarLoading=true;try{const response=await fetch('/api/avatar');if(!response.ok)return;const {url}=await response.json();if(url===avatarUrl)return;const gltf=url?await loader.loadAsync(url):null,model=gltf?.scene||null;if(model)model.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});const old=avatar.setModel(model,gltf?.animations||[]);if(old)dispose(old);avatarUrl=url;renderer.shadowMap.needsUpdate=true;}catch{}finally{avatarLoading=false;}}
  document.addEventListener('keydown',e=>{if(e.code!=='KeyO'||e.repeat||!walking||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable||document.querySelector('dialog[open]'))return;e.preventDefault();thirdPerson=!thirdPerson;mouseLook.reset();canvas.dataset.perspective=thirdPerson?'third':'first';});
  function renderView(dt){
    const now=performance.now();if(now-lastAvatarSync>15000){lastAvatarSync=now;void syncAvatar();}
    cockpit.update(vehicles.active,walking&&!thirdPerson,keys,paused,dt,walking);
    const v=vehicles.active,position=camera.position.clone();
    if(v){const offset=v.type==='bike'?.35:0;position.set(v.group.position.x+Math.sin(v.heading)*offset,v.y+(v.type==='bike'?.24:-.2),v.group.position.z+Math.cos(v.heading)*offset);}else position.y-=seated?1.85:1.7;
    avatar.update({position,running:keys.has('ShiftLeft')||keys.has('ShiftRight'),yaw:v?v.heading:seated?yaw:avatarYaw,visible:walking&&(thirdPerson||v?.type==='bike'),firstPerson:walking&&!thirdPerson&&v?.type==='bike',moving:walking&&!paused&&!seated&&!v&&walkMoved,seated:!!seated||!!v,vehicleType:v?.type,crankPhase:v?.crankPhase||0,dt});
    multiplayer.update({x:origin.x*70+position.x,y:position.y,z:origin.z*70+position.z,yaw:v?v.heading:seated?yaw:avatarYaw,active:walking,moving:walking&&!paused&&!seated&&!v&&walkMoved,running:keys.has('ShiftLeft')||keys.has('ShiftRight'),seated:!!seated||!!v,vehicleType:v?.type||null,crankPhase:v?.crankPhase||0},dt);
    if(!walking)return camera;
    viewCamera.copy(camera);viewCamera.aspect=camera.aspect;viewCamera.updateProjectionMatrix();
    if(v&&!thirdPerson){viewCamera.position.set(v.group.position.x+(v.type==='bike'?Math.sin(v.heading)*.1:0),v.y+(v.type==='bike'?1.8:1.25),v.group.position.z+(v.type==='bike'?Math.cos(v.heading)*.1:0));viewCamera.rotation.copy(camera.rotation);}
    else if(thirdPerson&&!v){const target=camera.position.clone(),desired=chasePosition(target,camera.getWorldDirection(new THREE.Vector3())),delta=desired.clone().sub(target);viewRay.set(target,delta.clone().normalize());viewRay.far=delta.length();const hit=viewRay.intersectObjects(models.children,true)[0];if(hit)desired.copy(target).addScaledVector(viewRay.ray.direction,Math.max(.1,hit.distance-.25));desired.y=Math.max(desired.y,terrain.surface(origin.x*70+desired.x,origin.z*70+desired.z)+.3);viewCamera.position.copy(desired);viewCamera.lookAt(target.clone().addScaledVector(camera.getWorldDirection(new THREE.Vector3()),1).add(new THREE.Vector3(0,-.5,0)));}
    return viewCamera;
  }
  window.addEventListener('blur',()=>mouseLook.reset());
  document.addEventListener('visibilitychange',()=>mouseLook.reset());
  const interactionHint=document.createElement('div');interactionHint.id='interaction-hint';interactionHint.hidden=true;interactionHint.style.cssText='position:fixed;left:50%;top:60%;transform:translateX(-50%);padding:12px 20px;border:1px solid #ffffff55;border-radius:8px;background:#18312ce6;color:white;pointer-events:none;font-size:15px';document.querySelector('#walk-hud').append(interactionHint);
  let seated=null,standPosition=null,lastInteraction=0,interactionTarget=null;
  const interactionRay=new THREE.Raycaster();
  function standUp(){if(!seated)return;if(walking&&standPosition)camera.position.set(standPosition.x-origin.x*70,standPosition.y,standPosition.z-origin.z*70);seated=null;standPosition=null;velocity=0;keys.clear();interactionTarget=null;}
  function updateInteraction(now){
    if(vehicles.active){interactionHint.hidden=true;return;}
    if(seated&&(!walking||!seated.root.parent))standUp();
    if(seated){camera.position.copy(seatPosition(seated)).add(new THREE.Vector3(0,.95,0));interactionHint.textContent='F · 起身';interactionHint.hidden=!walking||paused;return;}
    if(!walking||paused){interactionHint.hidden=true;interactionTarget=null;return;}
    if(now-lastInteraction<100)return;lastInteraction=now;
    const direction=camera.getWorldDirection(new THREE.Vector3());
    interactionTarget=findInteraction([...loaded.values()].flatMap(v=>v.interactions).concat(vehicles.targets()),camera.position,direction,(target,distance)=>{interactionRay.set(camera.position,target.clone().sub(camera.position).normalize());interactionRay.far=Math.max(0,distance-.65);return !interactionRay.intersectObjects(models.children,true).length;});
    interactionHint.hidden=!interactionTarget;interactionHint.textContent=interactionTarget?.vehicle?`F · 驾驶${VEHICLES[interactionTarget.vehicle.type].name}`:'F · 坐下';
  }
  document.addEventListener('keydown',e=>{
    if(!walking||paused||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable||document.querySelector('dialog[open]'))return;
    if((seated||vehicles.active)&&e.code==='Space'){if(vehicles.active)keys.add('Space');e.preventDefault();e.stopImmediatePropagation();return;}
    if(e.code!=='KeyF'||e.repeat)return;e.preventDefault();
    if(vehicles.active){const exit=vehicles.exit();if(!exit){onError('周围没有安全下车位置，请把车移到空地');return;}camera.position.set(exit.x-origin.x*70,exit.y,exit.z-origin.z*70);yaw=exit.heading;pitch=-.08;camera.rotation.set(pitch,yaw,0);velocity=0;keys.clear();mouseLook.reset();interactionTarget=null;return;}
    if(seated){standUp();return;}lastInteraction=0;updateInteraction(performance.now());if(!interactionTarget)return;
    if(interactionTarget.vehicle){vehicles.enter(interactionTarget.vehicle);keys.clear();velocity=0;mouseLook.reset();return;}
    standPosition={x:origin.x*70+camera.position.x,y:camera.position.y,z:origin.z*70+camera.position.z};seated=interactionTarget;velocity=0;keys.clear();
    const forward=new THREE.Vector3(-Math.sin(seated.yaw),0,-Math.cos(seated.yaw)).transformDirection(seated.node.matrixWorld);yaw=Math.atan2(-forward.x,-forward.z);pitch=-.08;camera.rotation.set(pitch,yaw,0);updateInteraction(performance.now());
  },true);
  function lock(){mouseLook.reset();paused=false;try{const result=canvas.requestPointerLock?.();result?.catch(()=>mouseLook.reset());}catch{mouseLook.reset();}canvas.focus();}
  function dragHit(e,y){const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-y),new THREE.Vector3());}
  function endVertexDrag(){if(!vertexDrag)return;const id=vertexDrag.id;vertexDrag=null;pointerStart=null;controls.enabled=!walking;canvas.style.cursor='';if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}
  canvas.addEventListener('pointerdown',e=>{
    if(!landDrawing||walking||e.button!==0||vertexDrag)return;
    const rect=canvas.getBoundingClientRect();let index=-1,best=16;
    draftGroup.updateMatrixWorld(true);
    draftGroup.children.filter(v=>v.geometry?.type==='SphereGeometry').forEach((marker,i)=>{const p=marker.position.clone().project(camera),d=Math.hypot(rect.left+(p.x+1)*rect.width/2-e.clientX,rect.top+(1-p.y)*rect.height/2-e.clientY);if(p.z>=-1&&p.z<=1&&d<best){best=d;index=i;}});
    if(index<0)return;
    const y=draftElevation??Math.max(...draftPoints.map(([x,z])=>terrain.ground(x,z)))+.15,hit=dragHit(e,y+.12);if(!hit)return;
    vertexDrag={id:e.pointerId,index,y:y+.12,offset:[draftPoints[index][0]-origin.x*70-hit.x,draftPoints[index][1]-origin.z*70-hit.z]};
    controls.enabled=false;keys.clear();pointerStart=null;canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';e.preventDefault();e.stopImmediatePropagation();
  },true);
  canvas.addEventListener('pointermove',e=>{
    if(!vertexDrag||e.pointerId!==vertexDrag.id)return;
    const hit=dragHit(e,vertexDrag.y);if(hit)onLandMove?.(vertexDrag.index,[Math.round((origin.x*70+hit.x+vertexDrag.offset[0])/2)*2,Math.round((origin.z*70+hit.z+vertexDrag.offset[1])/2)*2]);
    e.preventDefault();e.stopImmediatePropagation();
  },true);
  for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,e=>{if(!vertexDrag||e.pointerId!==vertexDrag.id)return;endVertexDrag();e.preventDefault();e.stopImmediatePropagation();},true);
  canvas.addEventListener('lostpointercapture',endVertexDrag);window.addEventListener('blur',endVertexDrag);
  canvas.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};if(walking&&paused)lock();});
  canvas.addEventListener('pointerup',e=>{if(walking){if(!paused&&e.button===0){pointer.set(0,0);raycaster.setFromCamera(pointer,camera);if(terrain.interact(raycaster))canvas.dataset.waterInteraction=String(Date.now());}return;}if(!pointerStart||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>5)return;const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);if(landDrawing){const hit=terrain.pick(raycaster);if(hit)onLandPoint?.([Math.round((origin.x*70+hit.x)/2)*2,Math.round((origin.z*70+hit.z)/2)*2]);return;}if(terrain.interact(raycaster)){canvas.dataset.waterInteraction=String(Date.now());return;}const hit=terrain.pick(raycaster);if(!hit)return;const lot=terrain.lotAt(origin.x*70+hit.x,origin.z*70+hit.z);if(!lot)return;selected={x:lot.x,z:lot.z};updateOutline();onSelect(selected);});
  document.addEventListener('mousemove',e=>{if(walking&&!paused&&document.pointerLockElement===canvas)mouseLook.locked(e.movementX,e.movementY);});
  canvas.addEventListener('pointermove',e=>{if(walking&&!paused&&!document.pointerLockElement)mouseLook.absolute(e.clientX,e.clientY);});
  canvas.addEventListener('pointerleave',()=>mouseLook.reset());
  document.addEventListener('pointerlockchange',()=>{mouseLook.reset();if(walking&&!document.pointerLockElement){paused=true;keys.clear();}});
  document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable||document.querySelector('dialog[open]'))return;if(!walking&&['Space','Escape'].includes(e.code))return;if(e.code==='Escape'){paused=true;keys.clear();document.exitPointerLock?.();}if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space'].includes(e.code)){e.preventDefault();if(walking&&e.code==='Space'&&!e.repeat&&camera.position.y<=floorAt(camera.position.x,camera.position.z)+1.71&&!paused)velocity=6;keys.add(e.code);}});
  document.addEventListener('focusin',()=>keys.clear());document.addEventListener('visibilitychange',()=>keys.clear());
  document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();paused=true;});
  function setWalk(value,{lockPointer=true}={}){if(value){thirdPerson=false;landDrawing=false;document.body.dataset.land='false';controls.enableRotate=true;}walking=value;controls.enabled=!value;keys.clear();velocity=0;atmosphere.setWalking(value);document.body.dataset.walk=String(value);document.querySelector('#walk-hud').hidden=!value;if(value){let z=origin.x===0&&origin.z===0?48:18,x=0;if(floorAt(x,z)<.5){let shore;search:for(let radius=16;radius<=1024;radius+=16)for(let i=0;i<16;i++){const sx=Math.cos(i*Math.PI/8)*radius,sz=z+Math.sin(i*Math.PI/8)*radius;if(floorAt(sx,sz)>=.5){shore={x:sx,z:sz};break search;}}if(!shore){setWalk(false);onError('这里是开阔海面，请先把地图移到岸边再开始散步');return;}x=shore.x;z=shore.z;}camera.position.set(x,floorAt(x,z)+1.7,z);yaw=0;pitch=-.08;camera.rotation.set(pitch,yaw,0);if(lockPointer)lock();else{paused=true;mouseLook.reset();}}else{document.exitPointerLock?.();const h=terrain.surface(origin.x*PLOT.cell,origin.z*PLOT.cell);camera.position.set(130,h+150,170);controls.target.set(0,h,0);controls.update();}}
  let mapOpen=false;
  function frame(now){requestAnimationFrame(frame);if(document.hidden||!ready||mapOpen){lastTime=now;return;}syncLandView();const dt=Math.min((now-lastTime)/1000||.016,.05);lastTime=now;
    if(!walking&&vehicles.active)vehicles.stop();vehicles.update(dt,keys,walking&&!paused,camera);
    walkMoved=false;
    if(walking){if(!paused&&!seated&&!vehicles.active){let forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),right=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));const norm=Math.hypot(forward,right)||1,speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?10:5)*dt;forward/=norm;right/=norm;const dx=(right*Math.cos(yaw)-forward*Math.sin(yaw))*speed,dz=(-right*Math.sin(yaw)-forward*Math.cos(yaw))*speed;
      const beforeX=camera.position.x,beforeZ=camera.position.z;
      if(!blocked(camera.position.x+dx,camera.position.z,camera.position.y))camera.position.x+=dx;if(!blocked(camera.position.x,camera.position.z+dz,camera.position.y))camera.position.z+=dz;
      const movedX=camera.position.x-beforeX,movedZ=camera.position.z-beforeZ;walkMoved=Math.hypot(movedX,movedZ)>1e-6;avatarYaw=walkFacing(avatarYaw,movedX,movedZ,dt);
      const floor=floorAt(camera.position.x,camera.position.z)+1.7;velocity-=16*dt;camera.position.y=Math.max(floor,camera.position.y+velocity*dt);if(camera.position.y<=floor)velocity=0;
    }}else{
      if(!document.querySelector('dialog[open]')){const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),right=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),norm=Math.hypot(forward,right)||1;
        const fx=landDrawing?0:controls.target.x-camera.position.x,fz=landDrawing?-1:controls.target.z-camera.position.z,length=Math.hypot(fx,fz)||1,speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?120:60)*dt/norm,dx=(fx/length*forward-fz/length*right)*speed,dz=(fz/length*forward+fx/length*right)*speed;
        camera.position.x+=dx;camera.position.z+=dz;controls.target.x+=dx;controls.target.z+=dz;
      }controls.update();
    }
    const center=walking?camera.position:controls.target,dx=Math.round(center.x/PLOT.cell),dz=Math.round(center.z/PLOT.cell);if((dx||dz)&&now-lastRefresh>350){lastRefresh=now;moveOrigin(origin.x+dx,origin.z+dz,false);}
    if(town)town.visible=Math.abs(origin.x)<=5&&Math.abs(origin.z)<=5;
    if(walking&&now-lastTelemetry>100){lastTelemetry=now;canvas.dataset.walkPosition=JSON.stringify({x:origin.x*PLOT.cell+camera.position.x,y:camera.position.y,z:origin.z*PLOT.cell+camera.position.z,ground:floorAt(camera.position.x,camera.position.z),paused});}
    if(!walking)canvas.dataset.mapPosition=JSON.stringify({x:origin.x*70+controls.target.x,z:origin.z*70+controls.target.z});
    updateInteraction(now);const renderCamera=renderView(dt);atmosphere.update(dt,renderCamera,walking&&paused);if(!walking){scene.fog=overviewFog;overviewFog.color.copy(scene.background);}terrain.update(dt,sun,reducedMotion||(walking&&paused),renderCamera);if(vehicles.active?.type==='car'&&!thirdPerson)vehicles.active.group.visible=false;renderer.render(scene,renderCamera);if(vehicles.active)vehicles.active.group.visible=true;
  }
  function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}window.addEventListener('resize',resize);resize();renderGrid();requestAnimationFrame(frame);
  return {setPlayerIdentity:value=>multiplayer.setIdentity(value),setMapOpen(value){mapOpen=value;keys.clear();mouseLook.reset();controls.enabled=!value&&!walking;if(value){paused=true;document.exitPointerLock?.();}},get mapPose(){const v=vehicles.active,p=walking?camera.position:controls.target;return {x:v?v.x:origin.x*70+p.x,z:v?v.z:origin.z*70+p.z,heading:walking?(v?-v.heading:-yaw):Math.atan2(controls.target.x-camera.position.x,camera.position.z-controls.target.z)};},setLandDrawing(value){if(value&&walking)setWalk(false);landDrawing=value;document.body.dataset.land=String(value);controls.enableRotate=!value;},setLandDraft(points,color,elevation){draftPoints=points;draftColor=color;draftElevation=elevation;updateDraft();},focusPlot(plot){if(walking)setWalk(false);moveOrigin(Math.round(plot.cx/70),Math.round(plot.cz/70),true);selected={x:plot.x,z:plot.z};onSelect(selected);},findWater(){let best=null,distance=Infinity;const wx=origin.x*70,wz=origin.z*70;for(let x=-800;x<=800;x+=16)for(let z=-800;z<=800;z+=16){const d=x*x+z*z;if(d<distance&&terrain.ground(wx+x,wz+z)<-.2){best={x:Math.round((wx+x)/70),z:Math.round((wz+z)/70)};distance=d;}}return best;},setRows(values,plan){rows=values;planning=plan;renderGrid();if(focusElevation&&!walking){const h=terrain.surface(origin.x*70+controls.target.x,origin.z*70+controls.target.z);camera.position.y+=h-controls.target.y;controls.target.y=h;controls.update();focusElevation=false;}refreshBuildings();ready=true;},focus(x,z){if(walking)setWalk(false);selected={x,z};const lot=terrain.lotInfo(x,z);moveOrigin(lot?Math.round(lot.cx/70):x,lot?Math.round(lot.cz/70):z,true);onSelect(selected);},setWalk,get origin(){return {...origin};},get walking(){return walking;}};
}

export function createPreview(){
  const canvas=document.querySelector('#preview'),renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e5ecdf');scene.add(new THREE.HemisphereLight('#fff8ed','#85977d',2.5));const light=new THREE.DirectionalLight('#fff0dc',3);light.position.set(10,25,20);scene.add(light);
  const camera=new THREE.PerspectiveCamera(42,1,.1,500),controls=new OrbitControls(camera,canvas);controls.enableDamping=true;const loader=new GLTFLoader();let object=null,revision=0;
  function resize(){const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();}
  new ResizeObserver(resize).observe(canvas);function frame(){requestAnimationFrame(frame);if(!document.querySelector('#workspace').open||document.hidden)return;controls.update();renderer.render(scene,camera);}frame();
  return {async load(url){const token=++revision;if(object){scene.remove(object);dispose(object);object=null;}const gltf=await loader.loadAsync(url);if(token!==revision){dispose(gltf.scene);return;}object=gltf.scene;const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());object.position.sub(center);scene.add(object);const span=Math.max(size.x,size.y,size.z,1);camera.position.set(span*1.4,span,span*1.6);controls.target.set(0,0,0);controls.update();resize();},clear(){revision++;if(object){scene.remove(object);dispose(object);object=null;}}};
}
