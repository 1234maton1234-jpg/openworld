import * as THREE from 'three';
import {Water} from 'three/addons/objects/Water.js';
import {PLOT,heightAt} from '../shared/terrain.mjs';
import {WaterField} from '../shared/water-physics.mjs';
import {DepthGrid} from './depth-grid.mjs';

const surfaces=new Set();
export function createRiverWater(scene,options={}){
  const sampleHeight=options.heightAt||heightAt;
  const fixedDepth=options.depth||0,resolution=fixedDepth?1:513,span=2240,pixels=new Uint8Array(resolution*resolution*4),depthGrid=new DepthGrid(resolution,span,sampleHeight);
  const depth=new THREE.DataTexture(pixels,resolution,resolution,THREE.RGBAFormat);depth.minFilter=depth.magFilter=THREE.LinearFilter;depth.generateMipmaps=false;
  const water=new Water(new THREE.PlaneGeometry(options.width||span,options.length||span,fixedDepth?64:192,fixedDepth?16:192),{textureWidth:256,textureHeight:256,waterColor:'#226d87',sunColor:'#fff3dd',distortionScale:1.5,fog:true});
  water.rotation.x=-Math.PI/2;water.position.y=options.height??.025;scene.add(water);surfaces.add(water);
  const material=water.material,u=material.uniforms;
  const field=new WaterField(),wavePixels=new Uint8Array(field.size*field.size*4),waveTexture=new THREE.DataTexture(wavePixels,field.size,field.size,THREE.RGBAFormat);waveTexture.minFilter=waveTexture.magFilter=THREE.LinearFilter;waveTexture.generateMipmaps=false;
  const center=new THREE.Vector2();let worldX=0,worldZ=0,accumulator=0;
  const floaters=new THREE.Group(),leafGeometry=new THREE.SphereGeometry(.45,8,4),leafMaterial=new THREE.MeshStandardMaterial({color:'#ba9362',roughness:.75});scene.add(floaters);
  for(let i=0;i<3;i++){const leaf=new THREE.Mesh(leafGeometry,leafMaterial);leaf.scale.set(1,.15,.5);leaf.userData.vy=0;floaters.add(leaf);}
  Object.assign(u,{bedDepth:{value:depth},bedOffset:{value:new THREE.Vector2()},fixedDepth:{value:fixedDepth},waveOffset:{value:new THREE.Vector2()},riverPhase:{value:new THREE.Vector2()},daylight:{value:1},shallowColor:{value:new THREE.Color('#79b7ab')}});
  Object.assign(u,{rippleMap:{value:waveTexture},rippleCenter:{value:center},rippleSpan:{value:field.span}});
  function replace(source,from,to){if(!source.includes(from))throw new Error('Water shader interface changed');return source.replace(from,to);}
  material.fragmentShader=replace(material.fragmentShader,'uniform vec3 waterColor;',`uniform vec3 waterColor;
    uniform sampler2D bedDepth;
    uniform vec2 waveOffset,riverPhase,bedOffset;
    uniform float daylight,fixedDepth;
    uniform vec3 shallowColor;`);
  const rippleHeader='uniform sampler2D rippleMap; uniform vec2 rippleCenter; uniform float rippleSpan;';
  material.vertexShader=rippleHeader+material.vertexShader;
  material.fragmentShader=rippleHeader+material.fragmentShader;
  material.vertexShader=replace(material.vertexShader,'mirrorCoord = modelMatrix * vec4( position, 1.0 );',`vec4 displaced=modelMatrix*vec4(position,1.);
    vec2 rippleUV=(displaced.xz-rippleCenter)/rippleSpan+.5;
    float rippleMask=step(0.,rippleUV.x)*step(rippleUV.x,1.)*step(0.,rippleUV.y)*step(rippleUV.y,1.);
    displaced.y+=(texture2D(rippleMap,rippleUV).r*255.-128.)/127.*rippleMask;
    mirrorCoord=displaced;`);
  material.vertexShader=replace(material.vertexShader,'modelViewMatrix * vec4( position, 1.0 )','viewMatrix * displaced');
  const start=material.fragmentShader.indexOf('vec4 getNoise('),end=material.fragmentShader.indexOf('void sunLight(',start);
  if(start<0||end<0)throw new Error('Water normal shader missing');
  material.fragmentShader=material.fragmentShader.slice(0,start)+`
    vec4 getNoise(vec2 uv){
      float drift=.168*cos(uv.y/250.+riverPhase.x)+.1181818*cos(uv.y/110.+riverPhase.y);
      vec2 p=uv+waveOffset-vec2(drift,1.)*time*.6;
      float k=6.2831853/512.;
      p+=vec2(sin(p.y*k*3.+time*.04)+sin(dot(p,vec2(2.,1.))*k),cos(p.x*k*5.-time*.03))*11.;
      float a=dot(p,vec2(41.,9.))*k+sin(p.y*k*3.-time*.14)*.45;
      float b=dot(p,vec2(-19.,53.))*k-time*.38;
      float c=dot(p,vec2(87.,27.))*k+time*.24;
      float nx=cos(a)*.075-cos(b)*.032+cos(c)*.025;
      float nz=cos(a)*.017+cos(b)*.088+cos(c)*.012;
      vec2 depthBytes=texture2D(bedDepth,(uv+bedOffset)/${span.toFixed(1)}+.5).rg;
      float swell=smoothstep(4.,14.,(depthBytes.r+depthBytes.g/255.)*32.);
      nx+=cos(dot(p,vec2(13.,5.))*k-time*.55)*.09*swell;
      nz+=cos(dot(p,vec2(7.,-17.))*k-time*.4)*.075*swell;
      nx*=.4;nz*=.4;
      vec2 waveUV=(uv-rippleCenter)/rippleSpan+.5;
      float rippleMask=step(0.,waveUV.x)*step(waveUV.x,1.)*step(0.,waveUV.y)*step(waveUV.y,1.);
      vec2 physical=(texture2D(rippleMap,waveUV).gb*255.-128.)/127.;
      return vec4(nx-physical.x*rippleMask,nz-physical.y*rippleMask,1.,1.);
    }
  `+material.fragmentShader.slice(end);
  material.fragmentShader=replace(material.fragmentShader,'vec4 noise = getNoise( worldPosition.xz * size );',`
    vec2 bedUV=(worldPosition.xz+bedOffset)/${span.toFixed(1)}+.5;
    vec2 depthBytes=texture2D(bedDepth,bedUV).rg;
    float waterDepth=fixedDepth>0.?fixedDepth:(depthBytes.r+depthBytes.g/255.)*32.;
    if(waterDepth<.012)discard;
    vec4 noise = getNoise(worldPosition.xz);`);
  material.fragmentShader=replace(material.fragmentShader,'float rf0 = 0.3;','float rf0 = 0.035;');
  material.fragmentShader=replace(material.fragmentShader,'vec3 outgoingLight = albedo;',`
    float deep=1.-exp(-waterDepth*1.1);
    vec3 body=mix(shallowColor,waterColor,deep)*(.24+.76*daylight);
    float lightBands=pow(max(0.,sin((worldPosition.x+waveOffset.x)*2.1+time*.7)*sin((worldPosition.z+waveOffset.y)*1.8-time*.5)),8.);
    body+=lightBands*.07*exp(-waterDepth*1.5)*daylight;
    vec3 outgoingLight=mix(body,reflectionSample,clamp(reflectance,.035,.88))+specularLight*.22;
    float edge=(1.-smoothstep(.05,.42,waterDepth))*smoothstep(.015,.07,waterDepth);
    float foam=edge*smoothstep(.35,.85,sin(waterDepth*35.-time*1.5+noise.x*12.))*.22;
    outgoingLight=mix(outgoingLight,vec3(.72,.84,.80)*(.25+.75*daylight),foam);`);
  material.lights=false;
  material.vertexShader=material.vertexShader.replace('#include <shadowmap_pars_vertex>','').replace('#include <shadowmap_vertex>','');
  material.fragmentShader=material.fragmentShader.replace('#include <lights_pars_begin>','').replace('#include <shadowmap_pars_fragment>','').replace('#include <shadowmask_pars_fragment>','').replace('getShadowMask()','1.0');
  material.transparent=true;material.depthWrite=false;
  material.fragmentShader=replace(material.fragmentShader,'vec4( outgoingLight, alpha )','vec4( outgoingLight, smoothstep(0.0,.18,waterDepth)*mix(.63,.98,deep) )');
  wavePixels.fill(128);waveTexture.needsUpdate=true;
  const reflect=water.onBeforeRender;let reflected=-Infinity,reflectionDelay=1000/8,originKey='',elapsed=0;const readyAt=performance.now()+3000;
  water.onBeforeRender=function(renderer,world,camera){
    u.eye.value.copy(camera.position);
    const now=performance.now();if(now<readyAt||now-reflected<reflectionDelay)return;reflected=now;
    const hidden=[...surfaces].filter(s=>s!==water&&s.visible);hidden.forEach(s=>s.visible=false);
    try{reflect.call(this,renderer,world,camera);}finally{hidden.forEach(s=>s.visible=true);const cost=performance.now()-now;reflectionDelay=Math.max(1000/8,Math.min(1500,cost*4));reflected=performance.now();}
  };
  return {
    setOrigin(x,z,revision=''){const key=x+','+z+':'+revision;if(key===originKey)return;originKey=key;
      const wx=x*PLOT.cell,wz=z*PLOT.cell;
      worldX=wx;worldZ=wz;center.set(fixedDepth?options.x-wx:0,fixedDepth?options.z-wz:0);
      field.reset((ox,oz)=>fixedDepth?(Math.abs(ox)<options.width/2&&Math.abs(oz)<options.length/2?fixedDepth:0):Math.max(0,.025-sampleHeight(wx+ox,wz+oz)));
      let candidate=0;for(const leaf of floaters.children){leaf.visible=false;for(;candidate<field.depth.length;candidate+=7){if(field.depth[candidate]>.3){const ox=(candidate%field.size)*field.cell-field.span/2,oz=Math.floor(candidate/field.size)*field.cell-field.span/2;leaf.position.set(center.x+ox,water.position.y+.07,center.y+oz);leaf.userData.vy=0;leaf.visible=true;candidate+=field.size*6;break;}}}
      if(fixedDepth)water.position.set(options.x-wx,options.height,options.z-wz);
      if(!fixedDepth){depthGrid.request(wx,wz,revision);const old=depthGrid.current;if(old)u.bedOffset.value.set(wx-old.x,wz-old.z);}
      u.waveOffset.value.set(((wx%512)+512)%512,((wz%512)+512)%512);
      u.riverPhase.value.set((wz/250)%(Math.PI*2),(wz/110)%(Math.PI*2));reflected=-Infinity;
    },
    interact(raycaster){const point=raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-water.position.y),new THREE.Vector3());if(!point)return false;const ox=point.x-center.x,oz=point.z-center.y;if(fixedDepth&&(Math.abs(ox)>options.width/2||Math.abs(oz)>options.length/2))return false;return field.disturb(ox,oz,2.8);},
    update(dt,sun,paused=false){
      if(!fixedDepth&&depthGrid.step()){
        const current=depthGrid.current;for(let k=0;k<current.values.length;k++){const i=k*4,encoded=THREE.MathUtils.clamp((.025-current.values[k])/32,0,1)*255;pixels[i]=Math.floor(encoded);pixels[i+1]=Math.round((encoded-pixels[i])*255);pixels[i+3]=255;}
        depth.needsUpdate=true;u.bedOffset.value.set(worldX-current.x,worldZ-current.z);
      }
      if(!paused){elapsed+=dt;accumulator+=Math.min(dt,.05);while(accumulator>=1/60){field.step(1/60);accumulator-=1/60;}
        for(const leaf of floaters.children){if(!leaf.visible)continue;const ox=leaf.position.x-center.x,oz=leaf.position.z-center.y,sample=field.sample(ox,oz),target=water.position.y+sample.height+.07;
          leaf.userData.vy+=(22*(target-leaf.position.y)-7*leaf.userData.vy)*dt;leaf.position.y+=leaf.userData.vy*dt;leaf.rotation.z=-sample.slopeX;leaf.rotation.x=sample.slopeZ;
          const nextZ=leaf.position.z+dt*.38,valid=fixedDepth?Math.abs(nextZ-center.y)<options.length/2-.7:sampleHeight(worldX+leaf.position.x,worldZ+nextZ)<-.1;
          if(valid&&Math.abs(nextZ-center.y)<field.span/2-3)leaf.position.z=nextZ;
        }
      }
      for(let z=0;z<field.size;z++)for(let x=0;x<field.size;x++){const k=z*field.size+x,i=k*4,s=field.sample(x*field.cell-field.span/2,z*field.cell-field.span/2);wavePixels[i]=128+Math.round(field.height[k]*127);wavePixels[i+1]=128+Math.round(s.slopeX*127);wavePixels[i+2]=128+Math.round(s.slopeZ*127);wavePixels[i+3]=255;}waveTexture.needsUpdate=true;
      u.time.value=elapsed;u.sunDirection.value.copy(sun.position).normalize();u.sunColor.value.copy(sun.color).multiplyScalar(Math.min(1.2,sun.intensity/2.5));u.daylight.value=THREE.MathUtils.clamp(sun.intensity/2.5,.05,1);
    }
  };
}
