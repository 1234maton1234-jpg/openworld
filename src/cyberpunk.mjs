import {Vector2,PMREMGenerator} from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createWetRoads} from './render-quality.mjs';

export function createCyberpunk(renderer,scene,camera){
  const composer=new EffectComposer(renderer),render=new RenderPass(scene,camera);
  const wet=createWetRoads(),room=new RoomEnvironment(),pmrem=new PMREMGenerator(renderer);
  room.traverse(o=>{if(o.material?.isMeshLambertMaterial)o.material.emissive.set(o.position.x<0?'#61dce8':'#e394d2');});
  const environment=pmrem.fromScene(room,.08);room.dispose();pmrem.dispose();
  const originalEnvironment=scene.environment,originalIntensity=scene.environmentIntensity;
  const ao=new SSAOPass(scene,camera,1,1,12);ao.kernelRadius=5;ao.minDistance=.0005;ao.maxDistance=.025;
  let scan=0;
  const bloom=new UnrealBloomPass(new Vector2(1,1),.24,0,1.5);
  bloom.compositeMaterial.uniforms.bloomFactors.value=[1,.45,.15,.035,.005];
  // Bound only the bloom input; preserve the original HDR scene for tone mapping.
  bloom.materialHighPassFilter.fragmentShader=`
    uniform sampler2D tDiffuse;
    uniform float luminosityThreshold;
    varying vec2 vUv;
    void main(){
      vec3 c=max(texture2D(tDiffuse,vUv).rgb,vec3(0.));
      float peak=max(max(c.r,c.g),c.b);
      float contribution=smoothstep(luminosityThreshold,luminosityThreshold+.5,luminance(c));
      c*=min(1.,4./max(peak,.0001));
      gl_FragColor=vec4(c*contribution,1.);
    }`;
  const grade=new ShaderPass({
    uniforms:{tDiffuse:{value:null}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`
      uniform sampler2D tDiffuse;varying vec2 vUv;
      void main(){
        vec4 sampleColor=texture2D(tDiffuse,vUv);vec3 c=sampleColor.rgb;
        float l=dot(c,vec3(.2126,.7152,.0722));
        float shadows=1.-smoothstep(.025,.45,l);
        float highlights=smoothstep(.35,1.8,l);
        c=mix(vec3(l),c,1.12);
        c*=mix(vec3(1.),vec3(.76,1.08,1.22),shadows*.72);
        c*=mix(vec3(1.),vec3(1.15,.91,1.10),highlights*.65);
        c+=vec3(.002,.009,.014)*shadows;
        vec2 edge=(vUv-.5)*2.;
        c*=1.-.12*smoothstep(.25,1.65,dot(edge,edge));
        gl_FragColor=vec4(max(c,vec3(0.)),sampleColor.a);
      }`
  });
  const output=new OutputPass(),antialias=new ShaderPass(FXAAShader);
  for(const pass of [render,ao,bloom,grade,output,antialias])composer.addPass(pass);
  let enabled=true;
  try{enabled=localStorage.getItem('openworld.visual-style')!=='natural';}catch{}
  const button=document.createElement('button');button.id='visual-style';button.type='button';
  button.style.cssText='padding:8px 9px;border:1px solid #69dfdd80;border-radius:12px;background:#101d2be8;color:#a5f3ed;cursor:pointer;font:inherit;font-size:12px;pointer-events:auto;white-space:nowrap;flex-shrink:0';
  function sync(){button.textContent=enabled?'◈ 赛博':'◇ 原色';button.setAttribute('aria-pressed',String(enabled));button.setAttribute('aria-label','赛博朋克画面效果');button.title=enabled?'切换为原色画面':'开启赛博朋克画面';}
  button.addEventListener('click',()=>{enabled=!enabled;sync();try{localStorage.setItem('openworld.visual-style',enabled?'cyberpunk':'natural');}catch{}});
  const toolbar=document.querySelector('#map-clock'),controls=document.createElement('div'),originalWrap=toolbar?.style.flexWrap;
  controls.style.cssText='display:flex;gap:8px;justify-content:center;flex-basis:100%';
  if(toolbar){toolbar.style.flexWrap='wrap';toolbar.append(controls);}controls.append(button);sync();
  function resize(w,h){
    const width=Math.max(1,w),height=Math.max(1,h);
    const ratio=Math.min(renderer.getPixelRatio(),1.15,Math.sqrt(1920*1080/(width*height)));
    composer.setPixelRatio(ratio);composer.setSize(width,height);
    ao.setSize(Math.max(1,Math.round(width*ratio*.65)),Math.max(1,Math.round(height*ratio*.65)));
    antialias.uniforms.resolution.value.set(1/(width*ratio),1/(height*ratio));
  }
  button.addEventListener('click',()=>{scan=0;});
  function updateCamera(pass,camera,material){
    pass.camera=camera;const uniforms=material.uniforms;
    uniforms.cameraNear.value=camera.near;uniforms.cameraFar.value=camera.far;
    uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
  }
  return {
    render(camera,dt){
      scan-=dt;if(scan<=0){wet.update(scene,enabled||document.body.dataset.weatherWet==='true');scan=.5;}
      scene.environment=enabled?environment.texture:originalEnvironment;scene.environmentIntensity=enabled?(document.body.dataset.light==='night'?.28:.5):originalIntensity;
      if(!enabled){renderer.render(scene,camera);return;}
      render.camera=camera;updateCamera(ao,camera,ao.ssaoMaterial);composer.render(dt);
    },
    resize,
    dispose(){controls.remove();if(toolbar)toolbar.style.flexWrap=originalWrap;wet.dispose();scene.environment=originalEnvironment;scene.environmentIntensity=originalIntensity;environment.dispose();for(const pass of composer.passes)pass.dispose();composer.dispose();}
  };
}
