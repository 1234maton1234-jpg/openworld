const art=document.querySelector('.hero-art'),scene=art.querySelector('.world-scene'),controls=art.querySelector('.layer-controls'),feedback=art.querySelector('.layer-feedback');
const motion=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(hover: hover) and (pointer: fine)');
controls.hidden=false;feedback.hidden=false;
const toggles=[...controls.querySelectorAll('[data-toggle]')];
function setLayer(button,visible){button.setAttribute('aria-pressed',String(visible));scene.querySelectorAll(`[data-layer="${button.dataset.toggle}"]`).forEach(layer=>layer.classList.toggle('layer-off',!visible));}
function describe(){const active=toggles.filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.textContent);feedback.textContent=active.length?'正在显示：'+active.join(' · '):'图层已隐藏，点击上方按钮重新显示';}
toggles.forEach(button=>button.addEventListener('click',()=>{setLayer(button,button.getAttribute('aria-pressed')!=='true');describe();}));
document.querySelector('#reset-layers').addEventListener('click',()=>{toggles.forEach(button=>setLayer(button,true));describe();});describe();
let frame=0,tiltX=0,tiltY=0;
function resetTilt(){cancelAnimationFrame(frame);frame=0;scene.style.transform='';}
art.addEventListener('pointermove',e=>{if(motion.matches||!fine.matches)return;const rect=art.getBoundingClientRect();tiltX=(e.clientY-rect.top)/rect.height-.5;tiltY=(e.clientX-rect.left)/rect.width-.5;if(!frame)frame=requestAnimationFrame(()=>{scene.style.transform=`perspective(1100px) rotateX(${-tiltX*5}deg) rotateY(${tiltY*7}deg)`;frame=0;});});
art.addEventListener('pointerleave',resetTilt);motion.addEventListener('change',resetTilt);
if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(!entry.isIntersecting)return;observer.unobserve(entry.target);if(!motion.matches)entry.target.animate([{opacity:.55,transform:'translateY(18px)'},{opacity:1,transform:'translateY(0)'}],{duration:550,easing:'cubic-bezier(.2,.7,.3,1)'});}),{threshold:.12});document.querySelectorAll('.section-head,.about-copy,.moment-grid article,.build-steps article,.repo').forEach(el=>observer.observe(el));}
