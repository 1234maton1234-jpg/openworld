import {inside,plotPolygon} from '../shared/polygon-land.mjs';
const element=(tag,value='',className='')=>{const el=document.createElement(tag);el.textContent=value;el.className=className;return el;};
const title=plot=>plot.name||'未命名领地';
export function territoryAt(rows,x,z){return rows.find(plot=>inside(plotPolygon(plot),[x,z]));}
export function createTerritoryInfo(world,getRows){
  const card=element('aside','','territory-card territory-motion');card.inert=true;card.setAttribute('aria-hidden','true');card.setAttribute('aria-label','当前领地');
  const eyebrow=element('small','◆  正在探索 · 玩家领地'),name=element('h2'),owner=element('p','','territory-owner'),description=element('p','','territory-summary'),more=element('button','了解更多  ↗'),meta=element('div','','territory-meta');card.append(eyebrow,name,owner,description,meta,more);document.body.append(card);
  const dialog=element('dialog','','territory-detail');dialog.setAttribute('aria-label','领地详细信息');document.body.append(dialog);let current,stamp='';
  more.onclick=()=>{if(!current)return;const plot=current;world.setMapOpen(true);const close=element('button','×','territory-close');close.setAttribute('aria-label','关闭领地详情');close.onclick=()=>dialog.close();dialog.replaceChildren(close,element('small','TERRITORY · 玩家领地'),element('h2',title(plot)),element('p','主人 @'+plot.login,'territory-owner'),element('p',plot.description||'主人尚未填写领地介绍。','territory-description'),element('p',`面积 ${plot.area||4096} m² · 坐标 ${plot.x} / ${plot.z}`),element('p',plot.published?'已有公开建筑':'暂无已公开建筑'));dialog.showModal();};
  dialog.addEventListener('close',()=>world.setMapOpen(false));
  setInterval(()=>{if(document.hidden)return;const pose=world.mapPose;current=world.walking?territoryAt(getRows(),pose.x,pose.z):null;const visible=!!current&&!document.querySelector('dialog[open]');if(visible!==card.classList.contains('is-visible')){card.classList.toggle('is-leaving',!visible);card.classList.toggle('is-visible',visible);}card.inert=!visible;card.setAttribute('aria-hidden',String(!visible));if(!current){stamp='';return;}const next=JSON.stringify(current);if(next===stamp)return;stamp=next;name.textContent=title(current);owner.replaceChildren(element('span',current.login?.slice(0,1).toUpperCase()||'W','territory-owner-avatar'),element('span','@'+current.login));description.textContent=current.description||'主人尚未填写领地介绍。';meta.replaceChildren(element('span',(current.area||4096)+' m²'),element('span',current.published?'已有公开建筑':'等待新的创作'));},250);
}
export function territoryEditor(plot,save){
  const form=element('form','','territory-editor'),name=element('input'),description=element('textarea'),button=element('button','保存领地信息');
  name.value=plot.name||'';name.required=true;name.maxLength=60;name.placeholder='为你的领地取个名字';description.value=plot.description||'';description.maxLength=1000;description.rows=3;
  for(const [label,input] of [['领地名字',name],['领地介绍',description]]){const field=element('label',label);field.append(input);form.append(field);}form.append(button);
  form.onsubmit=async event=>{event.preventDefault();button.disabled=true;try{await save({name:name.value,description:description.value});}finally{button.disabled=false;}};return form;
}
