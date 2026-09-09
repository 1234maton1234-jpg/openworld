const element=(tag,text='')=>{const e=document.createElement(tag);e.textContent=text;return e;};
export function createTeleportDialog({world,api,onTeleport}){
  const dialog=element('dialog');dialog.id='teleport-dialog';dialog.setAttribute('aria-label','传送码');
  dialog.innerHTML='<form><button type="button" data-close aria-label="关闭传送">×</button><small>WORLD TRANSIT</small><h2>去一个地方</h2><p>输入传送码，前往另一片风景。</p><label>传送码<input name="code" maxlength="24" required autocomplete="off" placeholder="spawn 或领地传送码"></label><button type="button" data-spawn>⌂ 返回原始出生点 · spawn</button><p data-message role="status"></p><button type="submit" class="dark">开始传送 ↗</button></form>';document.body.append(dialog);
  const input=dialog.querySelector('input'),submit=dialog.querySelector('[type="submit"]'),close=dialog.querySelector('[data-close]'),spawn=dialog.querySelector('[data-spawn]'),message=dialog.querySelector('[data-message]');let busy=false;
  close.onclick=()=>dialog.close();spawn.onclick=()=>{input.value='spawn';input.focus();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',()=>world.setMapOpen(false));
  dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;submit.disabled=close.disabled=spawn.disabled=true;message.textContent='正在加载目的地…';try{if(!world.canTeleport)throw new Error('请等待世界连接完成或当前传送结束');const destination=await api('/api/teleports/'+encodeURIComponent(input.value.trim()));await onTeleport(destination);dialog.close();}catch(error){message.textContent=error.message;}finally{busy=false;submit.disabled=close.disabled=spawn.disabled=false;}};
  return {open(){if(document.querySelector('dialog[open]'))return;message.textContent='';world.setMapOpen(true);dialog.showModal();input.focus();}};
}
export function teleportEditor(settings,save){
  const form=element('form');form.className='territory-editor teleport-editor';const title=element('h3','领地传送'),field=element('label','传送码'),input=element('input'),toggle=element('label','允许通过传送码到访'),enabled=element('input'),note=element('p','全站唯一；spawn 为系统保留码。关闭后保留你的传送码。'),message=element('p'),button=element('button','保存传送设置');
  input.value=settings.code;input.maxLength=24;input.placeholder='例如：锅锅之家';enabled.type='checkbox';enabled.checked=settings.enabled;field.append(input);toggle.prepend(enabled);note.className='small';message.setAttribute('role','status');form.append(title,field,toggle,note,message,button);
  form.onsubmit=async e=>{e.preventDefault();button.disabled=true;message.textContent='';try{const result=await save({code:input.value.trim(),enabled:enabled.checked});input.value=result.code;message.textContent='传送设置已保存';}catch(error){message.textContent=error.message;}finally{button.disabled=false;}};return form;
}
