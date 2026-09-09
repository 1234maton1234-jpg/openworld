import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createBuildingMotion} from './building-motion.mjs';

const $=s=>document.querySelector(s),labels={pending:'待审核',published:'已通过',rejected:'已退回',superseded:'历史版本'};
let csrf='',status='pending',offset=0,rows=[],selected=null,ready=false,busy=false,revision=0,listRevision=0,viewer;
const date=value=>value?new Date(Number(value)).toLocaleString('zh-CN',{hour12:false}):'—';
function text(tag,value){const e=document.createElement(tag);e.textContent=value;return e;}
function message(value,error=false){$('#message').textContent=value;$('#message').classList.toggle('error',error);}
function buttons(){for(const id of ['#approve','#reject'])$(id).disabled=busy||!ready||selected?.status!=='pending';for(const e of document.querySelectorAll('nav button,#refresh,#previous,#next,.item'))e.disabled=busy;$('#previous').disabled=busy||offset===0;$('#next').disabled=busy||rows.length<100;$('#note').disabled=busy;}
async function api(path,options={}){
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...options.headers},cache:'no-store'});
  const data=await response.json();
  if(!response.ok){if(response.status===401||response.status===403){ready=false;buttons();}throw new Error(data.error||'请求失败');}return data;
}
function createViewer(){
  const canvas=$('#preview'),renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=T.ACESFilmicToneMapping;
  const scene=new T.Scene();scene.background=new T.Color('#e9edf2');scene.add(new T.HemisphereLight('#ffffff','#8c99b0',2.4));const sun=new T.DirectionalLight('#fff6e9',3);sun.position.set(20,30,20);scene.add(sun);
  const camera=new T.PerspectiveCamera(42,1,.01,1000),controls=new OrbitControls(camera,canvas),loader=new GLTFLoader();controls.enableDamping=true;
  let root,motion,span=1,loadRevision=0;
  function dispose(object){if(!object)return;const resources=new Set();object.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}});object.removeFromParent();for(const r of resources)r.dispose();}
  function clear(){loadRevision++;dispose(root);root=null;motion=null;}
  function reset(){const distance=span*1.5/Math.min(camera.aspect,1);camera.position.set(distance,distance*.7,distance);camera.near=Math.max(.01,span/1000);camera.far=Math.max(1000,distance*10);camera.updateProjectionMatrix();controls.target.set(0,0,0);controls.maxDistance=distance*5;controls.update();}
  const resize=new ResizeObserver(()=>{const {width,height}=canvas.getBoundingClientRect();if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();});resize.observe(canvas);
  renderer.setAnimationLoop(()=>{if(document.hidden)return;motion?.update(Date.now()/1000);controls.update();renderer.render(scene,camera);});
  return {clear,reset,async load(url){clear();const token=loadRevision,gltf=await loader.loadAsync(url);if(token!==loadRevision){dispose(gltf.scene);return false;}root=gltf.scene;motion=createBuildingMotion(root);const box=new T.Box3().setFromObject(root),size=box.getSize(new T.Vector3());root.position.sub(box.getCenter(new T.Vector3()));span=Math.max(size.x,size.y,size.z,1);scene.add(root);reset();return true;}};
}
function clearSelection(){revision++;selected=null;ready=false;viewer?.clear();$('#details').hidden=true;$('#preview-status').hidden=false;$('#preview-status').textContent='选择一份提交，开始查看';buttons();}
async function optimizationStatus(id,token,value,attempt=0){
  try{const response=await fetch('/assets/'+encodeURIComponent(id)+'.glb?manifest=1',{signal:AbortSignal.timeout(15000)});if(token!==revision)return;const data=await response.json();if(!response.ok)throw Error();
    if(response.status===202){value.textContent='正在生成远景模型…';if(attempt<20)setTimeout(()=>{if(token===revision)void optimizationStatus(id,token,value,attempt+1);},3000);else value.textContent='仍在处理中，重新选择可刷新';}
    else value.textContent=`已生成 ${data.variants.length} 档 · 远景 ${Number(data.variants.at(-1).triangles).toLocaleString()} 面`;
  }catch{if(token===revision)value.textContent='优化暂不可用，使用原始模型';}
}
function renderList(){
  $('#list').replaceChildren(...rows.map((row,index)=>{const item=text('button','');item.className='item';item.setAttribute('aria-pressed',String(selected?.id===row.id));const number=text('div',String(offset+index+1).padStart(3,'0'));number.className='number';item.append(number,text('strong',row.plot_name||row.title||'未命名领地'),text('small','@'+row.login),text('small',date(row.created)));item.onclick=()=>{if(!busy)select(row);};return item;}));
  if(!rows.length){const empty=text('p',status==='pending'?'暂时没有待审核作品':'暂无相关记录');empty.className='empty';$('#list').append(empty);}
  $('#count').textContent=rows.length+' 件 / 本页';$('#page-number').textContent=String(offset/100+1).padStart(2,'0');buttons();
}
async function loadList(){
  const token=++listRevision;clearSelection();rows=[];renderList();message('正在加载审核队列…');
  try{const result=await api('/api/admin/submissions?status='+status+'&offset='+offset);if(token!==listRevision)return;rows=result;renderList();message(rows.length?'选择作品，检查模型后再执行审核。':'当前列表已处理完毕。');if(rows.length)await select(rows[0]);}
  catch(error){if(token===listRevision)message(error.message,true);}
}
async function select(row){
  clearSelection();const token=revision;selected=row;renderList();$('#details').hidden=false;$('#plot-name').textContent=row.plot_name||row.title||'未命名领地';$('#status').textContent=labels[row.status];$('#description').textContent=row.plot_description||'作者尚未填写领地介绍。';
  let metrics={};try{metrics=JSON.parse(row.metrics);}catch{}
  const dimensions=Array.isArray(metrics.size)?metrics.size.map(v=>Number(v).toFixed(2)).join(' × ')+' m':'—';
  const resources=metrics.resources;
  $('#metadata').replaceChildren(...[['提交者','@'+row.login],['提交时间',date(row.created)],['模型尺寸',dimensions],['三角面',Number(metrics.triangles||0).toLocaleString()],['材质 / 贴图',resources?`${resources.materials} / ${resources.textures}`:'旧模型未统计'],['贴图显存估算',resources?`${(resources.textureGpuBytesEstimate/1048576).toFixed(1)} MiB`:'—'],['地块坐标',row.x+' / '+row.z],['提交编号',row.id]].map(([key,value])=>{const div=text('div','');div.append(text('dt',key),text('dd',value));return div;}));
  $('#review-form').hidden=row.status!=='pending';$('#review-record').hidden=row.status==='pending';$('#record-text').textContent=`${labels[row.status]} · ${date(row.reviewed)}\n审核人 ID：${row.reviewer||'—'}\n${row.note||'未填写备注'}`;$('#note').value='';$('#preview-status').textContent='正在加载模型…';
  const optimization=text('div',''),optimizationValue=text('dd','检查中…');optimization.append(text('dt','远景优化'),optimizationValue);$('#metadata').append(optimization);void optimizationStatus(row.id,token,optimizationValue);
  try{viewer??=createViewer();const loaded=await viewer.load('/assets/'+encodeURIComponent(row.id)+'.glb');if(token!==revision||!loaded)return;ready=true;$('#preview-status').hidden=true;buttons();}
  catch(error){if(token!==revision)return;$('#preview-status').textContent='模型加载失败，请重新选择作品重试';message('模型预览失败，审核操作已禁用。',true);buttons();}
}
async function review(approve){
  if(busy||!ready||selected?.status!=='pending')return;
  const row=selected,note=$('#note').value.trim();if(!approve&&!note){message('请填写退回原因。',true);$('#note').focus();return;}
  busy=true;buttons();
  try{await api('/api/admin/submissions/'+encodeURIComponent(row.id)+'/review',{method:'POST',body:JSON.stringify({approve,note})});await loadList();message(approve?'已通过并公开，玩家将在世界刷新后看到作品。':'已退回，作者可查看备注并修改。');}
  catch(error){message(error.message+'；可刷新列表确认最新审核状态。',true);ready=false;}
  finally{busy=false;buttons();}
}
for(const button of document.querySelectorAll('[data-status]'))button.onclick=()=>{if(busy)return;status=button.dataset.status;offset=0;for(const b of document.querySelectorAll('[data-status]'))b.setAttribute('aria-pressed',String(b===button));$('#heading').textContent=labels[status]+'作品';loadList();};
$('#refresh').onclick=()=>{if(!busy)loadList();};$('#previous').onclick=()=>{offset=Math.max(0,offset-100);loadList();};$('#next').onclick=()=>{offset+=100;loadList();};$('#reset-view').onclick=()=>viewer?.reset();$('#review-form').onsubmit=e=>{e.preventDefault();review(true);};$('#reject').onclick=()=>review(false);
try{const session=await api('/api/session');if(!session.user?.admin)throw new Error('仅管理员可进入审核后台，请使用 tamikip 的 GitHub 账号登录。');csrf=session.csrf;$('#identity').textContent='@'+session.user.login;await loadList();}catch(error){message(error.message,true);}
