import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorldMap} from '../src/world-map.mjs';

test('player layer controls both maps and restores the saved preference',t=>{
  const contexts=[],buttons=['plots','bridges','rivers','players'].map(key=>({dataset:{layer:key},setAttribute(name,value){this[name]=value;}}));
  const element=()=>({style:{},append(){},replaceChildren(){},setAttribute(){},addEventListener(){},focus(){},clientWidth:600,clientHeight:500});
  const canvas=()=>{const calls=[],context=new Proxy({calls,measureText:s=>({width:s.length*7})},{get:(o,k)=>k in o?o[k]:(...args)=>calls.push([k,...args])});contexts.push(context);return {...element(),getContext:()=>context};};
  let dialog,mini,draw;const saved=new Map();
  t.mock.method(globalThis,'setInterval',fn=>{draw=fn;return 1;});
  const originals=new Map(['document','localStorage','ResizeObserver','devicePixelRatio'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  t.after(()=>{for(const [key,value] of originals)value?Object.defineProperty(globalThis,key,value):delete globalThis[key];});
  globalThis.devicePixelRatio=1;globalThis.ResizeObserver=class{observe(){}};
  globalThis.localStorage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};
  globalThis.document={hidden:false,body:{append(){}},addEventListener(){},querySelector:()=>null,createElement(tag){
    const e=element();if(tag==='button'){const c=canvas();e.querySelector=()=>c;mini=e;}
    if(tag==='dialog'){const c=canvas(),cache=new Map();e.querySelector=s=>s==='canvas'?c:s==='[data-layer="players"]'?buttons[3]:cache.get(s)||cache.set(s,element()).get(s);e.querySelectorAll=()=>buttons;e.showModal=()=>e.open=true;dialog=e;}return e;
  }};
  const world={mapPose:{x:700,z:-350,heading:0},mapPlayers:[{name:'Nearby',x:950,z:-350}],setMapOpen(){}};
  createWorldMap(world);mini.onclick();draw();
  assert.ok(contexts[0].calls.some(c=>c[0]==='arc'&&c[3]===3.5));
  assert.ok(contexts[1].calls.some(c=>c[0]==='fillText'&&c[1]==='Nearby'));
  for(const c of contexts)c.calls.length=0;
  buttons[3].onclick();draw();
  assert.equal(buttons[3]['aria-pressed'],'false');
  assert.equal(saved.get('openworld:map-players'),'false');
  assert.ok(contexts.every(c=>!c.calls.some(call=>call[0]==='arc')));
  createWorldMap(world);assert.equal(buttons[3]['aria-pressed'],'false');
  buttons[3].onclick();assert.equal(saved.get('openworld:map-players'),'true');
});
