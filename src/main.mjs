import {createWorld,createPreview} from './world.mjs';
import {PLOT,plotTerrain,validCoordinate,riverX} from '../shared/terrain.mjs';
import {createLandCheck} from '../shared/land-check.mjs';
import {polygonInfo,isConvex} from '../shared/polygon-land.mjs';
let landDraft=null,checkedLand=null;
const $=s=>document.querySelector(s),state={session:null,rows:[],planning:null,selected:null,mine:null,regionRequest:0,review:null,previewVersion:0};let toastTimer,preview;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,6000);}
async function api(path,options={}){const headers={...options.headers};if(options.method&&options.method!=='GET')headers['X-CSRF-Token']=state.session?.csrf||'';if(options.json){headers['Content-Type']='application/json';options.body=JSON.stringify(options.json);delete options.json;}const response=await fetch(path,{...options,headers});const data=await response.json();if(!response.ok)throw new Error(data.error||'请求失败');return data;}
function action(selector,fn){$(selector).addEventListener('click',async()=>{try{await fn();}catch(error){toast(error.message);}});}
function text(tag,value,className){const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el;}
async function session(){state.session=await api('/api/session');const user=state.session.user;$('#account-name').textContent=user?'@'+user.login:'访客';$('#login').hidden=!!user;$('#logout').hidden=!user;$('#admin').hidden=!user?.admin;$('#demo-note').hidden=!state.session.demo||!!user;if(user){state.mine=await api('/api/mine');}else state.mine=null;renderSelected();}
async function refreshRegion(){const token=++state.regionRequest,{x,z}=world.origin;if(state.regionKey!==x+','+z){state.regionKey=x+','+z;$('#coord-x').value=x;$('#coord-z').value=z;}try{const result=await api(`/api/world?x=${x}&z=${z}&radius=4`);if(token!==state.regionRequest)return;state.rows=result.plots;state.planning=result.planning;world.setRows(result.plots,result.planning);$('#world-status').textContent=`附近 ${result.plots.length} 块领地 · ${result.plots.filter(p=>p.published).length} 栋建筑`;if(landDraft)updateLand();else renderSelected();}catch(error){if(token===state.regionRequest){$('#world-status').textContent='同步失败 · 正在等待重试';toast(error.message);}}}
const world=createWorld({onSelect(selection){state.selected=selection;renderSelected();},onRegion:refreshRegion,onError:toast,onLandPoint:addVertex,onLandMove(index,point){if(!landDraft)return;const next=landDraft.map((p,i)=>i===index?point:p);if(!isConvex(next)||next.some((p,i)=>next.some((q,j)=>i!==j&&p[0]===q[0]&&p[1]===q[1])))return;landDraft=next;updateLand();}});
function addVertex(point){if(!landDraft)return;if(landDraft.length>=8)return toast('最多 8 个顶点，可拖动调整或撤销');if(landDraft.some(p=>p[0]===point[0]&&p[1]===point[1])||!isConvex([...landDraft,point]))return toast('请沿外边界依次加点，轮廓必须保持凸多边形');landDraft.push(point);updateLand();}
function updateLand(){checkedLand=null;let message=`${landDraft.length}/8 个顶点 · 点击添加，拖动顶点调整凸多边形`;
  if(landDraft.length>=3)try{const info=polygonInfo(landDraft);checkedLand=createLandCheck(state.planning,state.rows)(landDraft);message=`可领取 · ${landDraft.length} 边 · ${info.area.toFixed(0)} m² · ${info.width} × ${info.depth} m${checkedLand.entrance?' · 入口已连接道路':''}`;}catch(error){message=error.message;}
  $('#land-status').textContent=message;$('#land-status').style.color=checkedLand?'#286d4d':'#a63835';world.setLandDraft(landDraft,checkedLand?'#348a61':'#d95b56',checkedLand?.elevation);$('#land-undo').disabled=!landDraft.length;renderSelected();
}
function cancelLand(){landDraft=null;checkedLand=null;world.setLandDrawing(false);world.setLandDraft([]);$('#land-editor').hidden=true;renderSelected();}
action('#land-undo',()=>{landDraft?.pop();if(landDraft)updateLand();});action('#land-cancel',cancelLand);
action('#land-login',async()=>{if(state.session?.githubReady){location.href='/auth/github';return;}if(!state.session?.demo)return toast('站点管理员尚未配置 GitHub 登录');await api('/api/demo-login',{method:'POST'});await session();toast('已登录，可确认领取当前轮廓');});
action('#land-add',()=>{const x=Number($('#vertex-x').value),z=Number($('#vertex-z').value);if(!$('#vertex-x').value||!$('#vertex-z').value||!Number.isFinite(x)||!Number.isFinite(z))return toast('请输入顶点世界坐标');addVertex([Math.round(x/2)*2,Math.round(z/2)*2]);});
function renderSelected(){
  if(landDraft){$('#land-login').hidden=!!state.session?.user;$('#plot-title').textContent='圈出你的领地';$('#plot-description').textContent='逐点画出 3～8 边形。绿色可领取，红色提示原因；地皮边界之间至少相隔 2 米。';$('#plot-owner').textContent='2 米网格 · 每条边至少 8 米 · 限高 24 米';$('#open-upload').hidden=true;$('#claim').disabled=!checkedLand||!!state.mine?.plot;$('#claim').textContent=state.mine?.plot?'你已拥有一块领地':checkedLand?'确认领取这片土地 ↗':'调整轮廓后领取';return;}
  $('#land-login').hidden=true;
  const selected=state.selected,row=selected&&state.rows.find(r=>r.x===selected.x&&r.z===selected.z),own=row&&row.owner===state.session?.user?.id;
  const planned=selected&&state.planning?.lots.find(p=>p.x===selected.x&&p.z===selected.z),terrain=row?{...row,biome:'保留领地',relief:0,buildable:false}:planned||null;
  $('#plot-title').textContent=selected?`地块 ${selected.x} / ${selected.z}`:'从一块空地开始';
  $('#panel-tag').textContent=own?'YOUR TERRITORY':row?'NEIGHBORHOOD':'AVAILABLE LAND';
  $('#plot-description').textContent=!selected?'点击“挑选我的第一块地”，在道路围合的街区内圈地。':row?row.published?`「${row.title}」已通过审核，欢迎来做客。`:'这块地已有主人，正在等待第一栋建筑。':'尚无人领取。用 Codex 构建一间小屋，或属于自己的迷你小镇。';
  if(!row&&selected)$('#plot-description').textContent=terrain?'已开放的沿街地块，建筑地基已整平，入口连接公共道路。':'这里是道路、绿地或护岸。请点击有边框的沿街地块。';
  $('#plot-owner').textContent=(row?'领地主人 @'+row.login+' · ':'')+(terrain?`${terrain.biome} · 海拔 ${terrain.elevation.toFixed(1)} m · 高差 ${terrain.relief.toFixed(1)} m`:'');
  $('#claim').disabled=!selected||!!row||!!state.mine?.plot||!terrain?.buildable;
  $('#claim').textContent=!selected?'先选择一块地皮':own?'这是我的领地':row?'这块地已有主人':state.mine?.plot?'你已拥有一块领地':state.session?.user?'领取这块地皮 ↗':'登录后领取地皮 ↗';
  if(selected&&!row&&!terrain?.buildable)$('#claim').textContent='公共区域，不可领取';
  $('#open-upload').hidden=!own;
}
action('#start',()=>{if(state.mine?.plot)return showMine();if(!state.planning)return toast('请等待地图加载完成');landDraft=[];world.setLandDrawing(true);$('#land-editor').hidden=false;updateLand();toast('沿道路点击 3～8 个顶点圈地，WASD 平移，滚轮缩放；可撤销顶点');});
action('#home',()=>world.focus(0,0));action('#reset-view',()=>world.focus(0,0));
action('#walk',()=>{if(landDraft)cancelLand();world.setWalk(true);toast('点击画面控制视角；Esc 可释放鼠标。可走上低台阶和庭院，墙体会阻挡通行。');});action('#exit-walk',()=>world.setWalk(false));
$('#coordinates').addEventListener('submit',e=>{e.preventDefault();const x=Number($('#coord-x').value),z=Number($('#coord-z').value);if(!validCoordinate(x)||!validCoordinate(z))return toast('请输入有效整数坐标');world.focus(x,z);});
$('#login').addEventListener('click',e=>{if(!state.session?.githubReady){e.preventDefault();toast('GitHub 登录代码已就绪，站点管理员需先配置 OAuth App。当前可使用本地演示。');}});
action('#demo-login',async()=>{await api('/api/demo-login',{method:'POST'});await session();toast('已进入本地演示账号，可体验领取与审核流程');});
action('#logout',async()=>{await api('/api/logout',{method:'POST'});await session();$('#workspace').close();});
action('#claim',async()=>{
  if(!state.session?.user){if(state.session?.githubReady)location.href='/auth/github';else toast('请先使用本地演示账号，或由管理员配置 GitHub 登录');return;}
  if(landDraft){if(!checkedLand)return;const plot=await api('/api/plots/claim',{method:'POST',json:{polygon:landDraft}});cancelLand();state.selected={x:plot.x,z:plot.z};await session();await refreshRegion();toast(`${plot.polygon.length} 边形领地已领取 · ${plot.area} 平方米，可以下载轮廓开始建模`);return;}
  const selected={...state.selected};await api('/api/plots/claim',{method:'POST',json:selected});await session();await refreshRegion();toast(`地块 ${selected.x} / ${selected.z} 已属于你，可以开始建模了`);
});
function openWorkspace(admin){world.setWalk(false);state.review=null;state.previewVersion++;$('#review-actions').hidden=true;$('#workspace-title').textContent=admin?'审核工作台':'我的领地';$('#workspace-eyebrow').textContent=admin?'BUILD SOMETHING WORTH SHARING':'YOUR LITTLE CORNER';$('#review-list').hidden=!admin;$('#upload-form').hidden=admin||!state.mine?.plot;$('#mine-content').hidden=admin;$('#submission-list').hidden=admin;$('#preview-caption').textContent='选择建筑版本，即可旋转查看';$('#workspace').showModal();preview??=createPreview();preview.clear();}
async function previewSubmission(row,admin){
  const token=++state.previewVersion;state.review=null;$('#review-actions').hidden=true;$('#preview-caption').textContent='正在加载建筑…';
  try{await preview.load('/assets/'+row.id+'.glb');if(token!==state.previewVersion)return;const m=JSON.parse(row.metrics);$('#preview-caption').textContent=`${row.title} · ${m.size.map(v=>v.toFixed(1)).join(' × ')} 米 · ${Math.round(m.triangles).toLocaleString()} 三角面`;if(admin){state.review=row;$('#review-note').value='';$('#review-actions').hidden=false;}}
  catch(error){if(token===state.previewVersion){$('#preview-caption').textContent='建筑预览失败，请重试';toast('模型载入失败，不能执行审核');}}
}
function submissionCard(row,admin){
  const card=text('article','','submission'),head=text('div','','submission-head');head.append(text('strong',row.title),text('span',({pending:'待审核',published:'已公开',rejected:'已退回',superseded:'历史版本'})[row.status],'badge'));card.append(head);
  if(admin)card.append(text('p',`@${row.login} · 地块 ${row.x} / ${row.z}`,'small'));
  card.append(text('p',new Date(row.created).toLocaleString('zh-CN'),'small'));if(row.note)card.append(text('p','审核备注：'+row.note,'small'));
  const button=text('button',admin?'查看并审核 →':'查看模型 →');button.addEventListener('click',()=>previewSubmission(row,admin));card.append(button);return card;
}
async function showMine(){if(!state.session?.user)return toast('请先登录，再查看个人领地');state.mine=await api('/api/mine');openWorkspace(false);const plot=state.mine.plot;$('#mine-content').replaceChildren(text('p',plot?`你的地块 ${plot.x} / ${plot.z} · ${plot.polygon?plot.polygon.length+' 边形 · '+plot.area+' m²':'64×64 米'} · 限高 24 米`:'尚未领取地块。先在公共地图中挑选一块空地。','small'));$('#submission-list').replaceChildren(...state.mine.submissions.map(row=>submissionCard(row,false)));if(plot){const button=text('button','在地图中定位我的领地 ↗');button.onclick=()=>{$('#workspace').close();world.focusPlot(plot);};$('#mine-content').append(button);}}
async function showAdmin(){const rows=await api('/api/admin/submissions');openWorkspace(true);$('#review-list').replaceChildren(...rows.map(row=>submissionCard(row,true)));if(!rows.length)$('#review-list').append(text('p','目前没有待审核建筑。','small'));}
action('#mine',showMine);action('#open-upload',showMine);action('#admin',showAdmin);action('#close-workspace',()=>{$('#workspace').close();state.previewVersion++;state.review=null;preview?.clear();});
$('#workspace').addEventListener('close',()=>{state.previewVersion++;state.review=null;preview?.clear();});
$('#upload-form').addEventListener('submit',async e=>{e.preventDefault();const file=$('#model-file').files[0],title=$('#building-title').value.trim();if(!file||!title)return;if(file.size>12*1024*1024)return toast('文件超过 12 MB，请优化模型后再试');const button=$('#submit-model');button.disabled=true;button.textContent='正在上传并校验…';try{await api('/api/submissions?title='+encodeURIComponent(title),{method:'POST',headers:{'Content-Type':'model/gltf-binary'},body:file});$('#upload-form').reset();await showMine();toast('建筑已提交，审核通过后会自动出现在公共世界');}catch(error){toast(error.message);}finally{button.disabled=false;button.textContent='提交审核 ↑';}});
async function review(approve){const row=state.review;if(!row)return;const note=$('#review-note').value.trim();if(!approve&&!note)return toast('请填写退回原因');$('#approve').disabled=$('#reject').disabled=true;try{await api(`/api/admin/submissions/${row.id}/review`,{method:'POST',json:{approve,note}});await showAdmin();await refreshRegion();toast(approve?'审核通过，建筑已公开，其他访客将在 15 秒内看到更新':'已退回，作者可根据备注修改后重新提交');}finally{$('#approve').disabled=$('#reject').disabled=false;}}
action('#approve',()=>review(true));action('#reject',()=>review(false));
action('#blueprint',async()=>{const plot=state.mine?.plot;if(!plot?.polygon){const a=document.createElement('a');a.href='/BUILDING_SPEC.md';a.download='openworld-Codex建模规范.md';a.click();return;}
  const local=plot.polygon.map(([x,z])=>[x-plot.cx,z-plot.cz]),spec=`# openworld 多边形领地建模规范\n\n为我的 ${plot.polygon.length} 边形领地制作静态 GLB 建筑。面积 ${plot.area} 平方米，限高 24 米，外接长宽 ${plot.width} × ${plot.depth} 米。必须按以下真实边界设计，不能只使用外接矩形。\n\n## 本地边界\n\n单位为米，坐标对为 [X,Z]，Y 为高度。\n\n${JSON.stringify(local,null,2)}\n\n网站会将模型世界包围盒的 X/Z 中心对齐地皮外接矩形中心，并将模型最低点放到地基。请按此放置规则检查所有三角面的水平投影都在领地内，包括屋檐。凹角缺口不是可建设范围。\n\n最多 12 MB、100000 个三角面、512 节点、200 绘制单元；只使用静态、无扩展的标准 GLB 2.0。贴图须全部内嵌为 PNG/JPEG，单张最多 2048×2048，总像素不超过 1600 万。不要使用动画、骨骼、形变或外部资源。\n\n世界边界 [X,Z]：\n${JSON.stringify(plot.polygon,null,2)}\n`;
  const url=URL.createObjectURL(new Blob([spec],{type:'text/markdown;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='openworld-我的多边形领地.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
const authError=new URLSearchParams(location.search).get('auth');if(authError){toast(authError==='not-configured'?'站点尚未配置 GitHub OAuth App':'GitHub 登录未完成，请重新尝试');history.replaceState(null,'','/game');}
await session().catch(e=>toast(e.message));await refreshRegion();setInterval(()=>{if(!document.hidden)refreshRegion();},15000);
