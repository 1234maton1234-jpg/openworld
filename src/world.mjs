import {cityHeight as heightAt} from '../shared/city-plan.mjs';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createAtmosphere} from './atmosphere.mjs';
import {createTerrain} from './terrain-view.mjs';
import {SHOW_DEMO_CONTENT} from './demo-content.mjs';
import {PLOT,plotTerrain,MAX_COORDINATE,validCoordinate} from '../shared/terrain.mjs';
import {plotPolygon} from '../shared/polygon-land.mjs';

export function dispose(object){const geometries=new Set(),materials=new Set(),textures=new Set();object.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
export function createWorld({onSelect,onRegion,onError,onLandPoint}){
  const canvas=document.querySelector('#world'),renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(48,1,.1,1200);camera.position.set(155,125,195);camera.rotation.order='YXZ';
  const controls=new OrbitControls(camera,canvas);controls.target.set(0,0,0);controls.enableDamping=true;controls.minDistance=20;controls.maxDistance=310;controls.maxPolarAngle=Math.PI/2-.08;
  const sky=new THREE.HemisphereLight('#e9f1e4','#91a777',2),sun=new THREE.DirectionalLight('#fff0da',3);sun.position.set(-30,60,40);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-150,right:150,top:150,bottom:-150,near:.1,far:220});sun.shadow.normalBias=.15;scene.add(sky,sun);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(1500,1500),new THREE.MeshStandardMaterial({color:'#afc797',roughness:1}));ground.rotation.x=-Math.PI/2;scene.add(ground);
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const atmosphere=createAtmosphere({scene,sun,sky,ground,renderer,reducedMotion,invalidate(){}});atmosphere.setWorldOrigin(0,0);ground.position.y=-.15;
  const overviewFog=new THREE.Fog('#d6eef4',260,470);ground.visible=false;const terrain=createTerrain(scene,()=>{renderer.shadowMap.needsUpdate=true;}),models=new THREE.Group();scene.add(models);let origin={x:0,z:0},rows=[],planning=null,selected=null,town=null,walking=false,yaw=0,pitch=-.1,velocity=0,lastTime=0,lastRefresh=0,pointerStart=null,lastPointer=null,paused=false;
  const loaded=new Map(),pending=new Set(),loader=new GLTFLoader(),keys=new Set(),box=new THREE.Box3(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let desired=new Map(),lastTelemetry=0,ready=false,focusElevation=true;
  const outline=new THREE.LineLoop(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#406b48'}));outline.visible=false;scene.add(outline);
  let landDrawing=false,draftPoints=[],draftColor='#d95b56',draftElevation;
  const draftGroup=new THREE.Group();scene.add(draftGroup);
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
      loader.loadAsync('/assets/'+id+'.glb').then(gltf=>{
        if(!desired.has(id)){dispose(gltf.scene);return;}
        const object=gltf.scene,metrics=JSON.parse(row.metrics);object.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});place(object,row,metrics);models.add(object);loaded.set(id,{object,row,metrics});renderer.shadowMap.needsUpdate=true;
      }).catch(()=>onError('一栋建筑加载失败，将在下次刷新时重试')).finally(()=>pending.delete(id));
    }
  }
  if(SHOW_DEMO_CONTENT)loader.loadAsync('/demo-town.glb').then(gltf=>{town=gltf.scene;town.scale.setScalar(1.35);town.updateMatrixWorld(true);box.setFromObject(town);const y=4.15-box.min.y;town.position.set(-origin.x*PLOT.cell,y,-origin.z*PLOT.cell);town.traverse(o=>{if(o.isLight)o.visible=false;if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(town);atmosphere.registerTown(town);terrain.registerTown(town);}).catch(()=>onError('公共示范小镇未能载入，地块功能仍可使用'));
  function floorAt(x,z){return terrain.surface(origin.x*PLOT.cell+x,origin.z*PLOT.cell+z);}
  function blocked(x,z,y){const h=floorAt(x,z);if(h<.5||h>y-1.7+.8)return true;for(const {row,metrics} of loaded.values()){const cx=(row.cx-origin.x*PLOT.cell),cz=(row.cz-origin.z*PLOT.cell);if(y-1.7<row.elevation+metrics.size[1]&&Math.abs(x-cx)<metrics.size[0]/2+.35&&Math.abs(z-cz)<metrics.size[2]/2+.35)return true;}return false;}
  function look(dx,dy){yaw-=dx*.0025;pitch=THREE.MathUtils.clamp(pitch-dy*.0025,-1.4,1.4);camera.rotation.set(pitch,yaw,0);}
  function lock(){paused=false;try{const result=canvas.requestPointerLock?.();result?.catch(()=>{});}catch{}canvas.focus();}
  canvas.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};if(walking){if(paused)lock();lastPointer={x:e.clientX,y:e.clientY};}});
  canvas.addEventListener('pointerup',e=>{if(walking){if(!paused&&e.button===0){pointer.set(0,0);raycaster.setFromCamera(pointer,camera);if(terrain.interact(raycaster))canvas.dataset.waterInteraction=String(Date.now());}return;}if(!pointerStart||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>5)return;const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);if(landDrawing){const hit=terrain.pick(raycaster);if(hit)onLandPoint?.([Math.round((origin.x*70+hit.x)/2)*2,Math.round((origin.z*70+hit.z)/2)*2]);return;}if(terrain.interact(raycaster)){canvas.dataset.waterInteraction=String(Date.now());return;}const hit=terrain.pick(raycaster);if(!hit)return;const lot=terrain.lotAt(origin.x*70+hit.x,origin.z*70+hit.z);if(!lot)return;selected={x:lot.x,z:lot.z};updateOutline();onSelect(selected);});
  document.addEventListener('mousemove',e=>{if(walking&&!paused&&document.pointerLockElement===canvas)look(e.movementX,e.movementY);});
  canvas.addEventListener('pointermove',e=>{if(walking&&!paused&&!document.pointerLockElement){if(lastPointer)look(e.clientX-lastPointer.x,e.clientY-lastPointer.y);lastPointer={x:e.clientX,y:e.clientY};}});
  canvas.addEventListener('pointerleave',()=>lastPointer=null);
  document.addEventListener('pointerlockchange',()=>{if(walking&&!document.pointerLockElement){paused=true;keys.clear();}});
  document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable||document.querySelector('dialog[open]'))return;if(!walking&&['Space','Escape'].includes(e.code))return;if(e.code==='Escape'){paused=true;keys.clear();document.exitPointerLock?.();}if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space'].includes(e.code)){e.preventDefault();if(walking&&e.code==='Space'&&!e.repeat&&camera.position.y<=floorAt(camera.position.x,camera.position.z)+1.71&&!paused)velocity=6;keys.add(e.code);}});
  document.addEventListener('focusin',()=>keys.clear());document.addEventListener('visibilitychange',()=>keys.clear());
  document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();paused=true;});
  function setWalk(value){if(value){landDrawing=false;controls.enableRotate=true;}walking=value;controls.enabled=!value;keys.clear();velocity=0;atmosphere.setWalking(value);document.body.dataset.walk=String(value);document.querySelector('#walk-hud').hidden=!value;if(value){let z=origin.x===0&&origin.z===0?48:18,x=0;if(floorAt(x,z)<.5){let shore;search:for(let radius=16;radius<=1024;radius+=16)for(let i=0;i<16;i++){const sx=Math.cos(i*Math.PI/8)*radius,sz=z+Math.sin(i*Math.PI/8)*radius;if(floorAt(sx,sz)>=.5){shore={x:sx,z:sz};break search;}}if(!shore){setWalk(false);onError('这里是开阔海面，请先把地图移到岸边再开始散步');return;}x=shore.x;z=shore.z;}camera.position.set(x,floorAt(x,z)+1.7,z);yaw=0;pitch=-.08;camera.rotation.set(pitch,yaw,0);lock();}else{document.exitPointerLock?.();const h=terrain.surface(origin.x*PLOT.cell,origin.z*PLOT.cell);camera.position.set(130,h+150,170);controls.target.set(0,h,0);controls.update();}}
  function frame(now){requestAnimationFrame(frame);if(document.hidden||!ready){lastTime=now;return;}const dt=Math.min((now-lastTime)/1000||.016,.05);lastTime=now;
    if(walking){if(!paused){let forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),right=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));const norm=Math.hypot(forward,right)||1,speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?10:5)*dt;forward/=norm;right/=norm;const dx=(right*Math.cos(yaw)-forward*Math.sin(yaw))*speed,dz=(-right*Math.sin(yaw)-forward*Math.cos(yaw))*speed;
      if(!blocked(camera.position.x+dx,camera.position.z,camera.position.y))camera.position.x+=dx;if(!blocked(camera.position.x,camera.position.z+dz,camera.position.y))camera.position.z+=dz;
      const floor=floorAt(camera.position.x,camera.position.z)+1.7;velocity-=16*dt;camera.position.y=Math.max(floor,camera.position.y+velocity*dt);if(camera.position.y<=floor)velocity=0;
    }}else{
      if(!document.querySelector('dialog[open]')){const forward=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),right=Number(keys.has('KeyD'))-Number(keys.has('KeyA')),norm=Math.hypot(forward,right)||1;
        const fx=controls.target.x-camera.position.x,fz=controls.target.z-camera.position.z,length=Math.hypot(fx,fz)||1,speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?120:60)*dt/norm,dx=(fx/length*forward-fz/length*right)*speed,dz=(fz/length*forward+fx/length*right)*speed;
        camera.position.x+=dx;camera.position.z+=dz;controls.target.x+=dx;controls.target.z+=dz;
      }controls.update();
    }
    const center=walking?camera.position:controls.target,dx=Math.round(center.x/PLOT.cell),dz=Math.round(center.z/PLOT.cell);if((dx||dz)&&now-lastRefresh>350){lastRefresh=now;moveOrigin(origin.x+dx,origin.z+dz,false);}
    if(town)town.visible=Math.abs(origin.x)<=5&&Math.abs(origin.z)<=5;
    if(walking&&now-lastTelemetry>100){lastTelemetry=now;canvas.dataset.walkPosition=JSON.stringify({x:origin.x*PLOT.cell+camera.position.x,y:camera.position.y,z:origin.z*PLOT.cell+camera.position.z,ground:floorAt(camera.position.x,camera.position.z),paused});}
    if(!walking)canvas.dataset.mapPosition=JSON.stringify({x:origin.x*70+controls.target.x,z:origin.z*70+controls.target.z});
    atmosphere.update(dt,camera,walking&&paused);if(!walking){scene.fog=overviewFog;overviewFog.color.copy(scene.background);}terrain.update(dt,sun,reducedMotion||(walking&&paused));renderer.render(scene,camera);
  }
  function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}window.addEventListener('resize',resize);resize();renderGrid();requestAnimationFrame(frame);
  return {setLandDrawing(value){if(value&&walking)setWalk(false);landDrawing=value;document.body.dataset.land=String(value);controls.enableRotate=!value;},setLandDraft(points,color,elevation){draftPoints=points;draftColor=color;draftElevation=elevation;updateDraft();},focusPlot(plot){if(walking)setWalk(false);moveOrigin(Math.round(plot.cx/70),Math.round(plot.cz/70),true);selected={x:plot.x,z:plot.z};onSelect(selected);},findWater(){let best=null,distance=Infinity;const wx=origin.x*70,wz=origin.z*70;for(let x=-800;x<=800;x+=16)for(let z=-800;z<=800;z+=16){const d=x*x+z*z;if(d<distance&&terrain.ground(wx+x,wz+z)<-.2){best={x:Math.round((wx+x)/70),z:Math.round((wz+z)/70)};distance=d;}}return best;},setRows(values,plan){rows=values;planning=plan;renderGrid();if(focusElevation&&!walking){const h=terrain.surface(origin.x*70+controls.target.x,origin.z*70+controls.target.z);camera.position.y+=h-controls.target.y;controls.target.y=h;controls.update();focusElevation=false;}refreshBuildings();ready=true;},focus(x,z){if(walking)setWalk(false);selected={x,z};const lot=terrain.lotInfo(x,z);moveOrigin(lot?Math.round(lot.cx/70):x,lot?Math.round(lot.cz/70):z,true);onSelect(selected);},setWalk,get origin(){return {...origin};},get walking(){return walking;}};
}

export function createPreview(){
  const canvas=document.querySelector('#preview'),renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e5ecdf');scene.add(new THREE.HemisphereLight('#fff8ed','#85977d',2.5));const light=new THREE.DirectionalLight('#fff0dc',3);light.position.set(10,25,20);scene.add(light);
  const camera=new THREE.PerspectiveCamera(42,1,.1,500),controls=new OrbitControls(camera,canvas);controls.enableDamping=true;const loader=new GLTFLoader();let object=null,revision=0;
  function resize(){const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();}
  new ResizeObserver(resize).observe(canvas);function frame(){requestAnimationFrame(frame);if(!document.querySelector('#workspace').open||document.hidden)return;controls.update();renderer.render(scene,camera);}frame();
  return {async load(url){const token=++revision;if(object){scene.remove(object);dispose(object);object=null;}const gltf=await loader.loadAsync(url);if(token!==revision){dispose(gltf.scene);return;}object=gltf.scene;const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());object.position.sub(center);scene.add(object);const span=Math.max(size.x,size.y,size.z,1);camera.position.set(span*1.4,span,span*1.6);controls.target.set(0,0,0);controls.update();resize();},clear(){revision++;if(object){scene.remove(object);dispose(object);object=null;}}};
}
