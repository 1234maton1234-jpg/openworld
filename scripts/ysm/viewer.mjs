import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {buildModel,animationSupported} from './geometry.mjs';

const $=id=>document.getElementById(id),scene=new T.Scene();scene.background=new T.Color('#edf0f4');
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));$('stage').append(renderer.domElement);
const camera=new T.PerspectiveCamera(35,1,.01,1000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;
scene.add(new T.HemisphereLight(0xffffff,0x778899,2.5));const light=new T.DirectionalLight(0xffffff,2);light.position.set(-3,5,4);scene.add(light);
const grid=new T.GridHelper(12,24,0xadb7c5,0xd3dae3);scene.add(grid);
let models=[],current,rig,material,texture,active=null,start=performance.now(),revision=0;
function status(message){$('status').textContent=message;}
function option(label,value){const o=document.createElement('option');o.textContent=label;o.value=value;return o;}
function frameModel(){
  rig.root.updateMatrixWorld(true);const bounds=new T.Box3();rig.root.traverseVisible(o=>{if(o.isMesh){o.geometry.computeBoundingBox();bounds.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));}});const size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  if(!Number.isFinite(size.length())||size.length()===0)return;
  controls.target.copy(center);const distance=Math.max(size.y,size.x,size.z)*2;camera.position.copy(center).add(new T.Vector3(-distance*.15,distance*.12,-distance));camera.near=Math.max(.001,distance/1000);camera.far=Math.max(100,distance*20);camera.updateProjectionMatrix();controls.update();grid.position.y=bounds.min.y-.01;
}
async function setTexture(index,token){const next=await new T.TextureLoader().loadAsync(current.textures[index].url);if(token!==revision){next.dispose();return;}next.colorSpace=T.SRGBColorSpace;next.flipY=false;next.magFilter=T.NearestFilter;next.minFilter=T.NearestFilter;texture?.dispose();texture=next;material.map=next;material.needsUpdate=true;}
async function select(index){
  const token=++revision;current=models[index];if(rig){scene.remove(rig.root);rig.dispose();}material?.dispose();texture?.dispose();texture=null;
  material=new T.MeshStandardMaterial({color:0xffffff,roughness:1,side:T.DoubleSide,alphaTest:.1});rig=buildModel(current.geometry,material);scene.add(rig.root);
  const roots=new Set([...rig.bones.values()].filter(b=>!b.data.parentName).map(b=>b.data.name));
  const parts=[...rig.bones.values()].filter(b=>roots.has(b.data.parentName)||roots.has(b.data.name));
  $('parts').replaceChildren(...parts.map(b=>{const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=true;check.onchange=()=>{b.node.visible=check.checked;frameModel();};label.append(check,document.createTextNode(b.data.name));return label;}));
  const available=current.animations.filter(animationSupported);$('animation').replaceChildren(option('原始姿态',''),...available.map((a,i)=>option(a.name,String(i))));
  active=available.find(a=>a.name==='idle')||null;if(active)$('animation').value=String(available.indexOf(active));start=performance.now();
  $('animation').onchange=()=>{active=$('animation').value===''?null:available[Number($('animation').value)];start=performance.now();};
  $('texture').replaceChildren(...current.textures.map((t,i)=>option(t.name,String(i))));$('texture').disabled=!current.textures.length;
  $('texture').onchange=()=>setTexture(Number($('texture').value),revision).catch(e=>status(e.message));
  if(active)rig.update(active,0);
  if(!rig.triangles)throw Error('模型没有可显示的几何');frameModel();
  $('info').textContent=`${current.kind}\n${rig.bones.size} 骨骼 · ${rig.triangles.toLocaleString()} 三角面\n${available.length}/${current.animations.length} 个动作可播放`;
  $('warnings').replaceChildren(...current.warnings.map(w=>{const p=document.createElement('p');p.textContent=w;return p;}));
  if(current.textures.length){const i=Math.max(0,current.textures.findIndex(t=>t.name===current.defaultTexture));$('texture').value=String(i);await setTexture(i,token);}
  if(token===revision)status('已加载 · 拖动旋转，滚轮缩放');
}
async function install(data){models=data.models;$('model').replaceChildren(...models.map((m,i)=>option(m.name,String(i))));await select(0);}
$('model').onchange=()=>select(Number($('model').value)).catch(e=>status(e.message));
$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;status('正在解析 YSM…');try{const res=await fetch('/model',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});const data=await res.json();if(!res.ok)throw Error(data.error);await install(data);}catch(e){status('导入失败：'+e.message);}};
new ResizeObserver(()=>{const {width,height}=$('stage').getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}).observe($('stage'));
renderer.setAnimationLoop(()=>{if(rig)rig.update(active,(performance.now()-start)/1000);controls.update();renderer.render(scene,camera);});
fetch('/model').then(r=>r.json()).then(install).catch(e=>status('加载失败：'+e.message));
