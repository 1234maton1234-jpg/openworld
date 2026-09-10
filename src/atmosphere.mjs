import * as THREE from 'three';
import {createWorldClock} from './world-clock.mjs';
import {sampleTime,formatHour} from './time-of-day.mjs';
import {weatherAt,sampleWeather} from './weather.mjs';

export function createAtmosphere({scene,sun,sky,ground,renderer,invalidate,reducedMotion}){
  const worldClock=createWorldClock();
  let hour=worldClock(),elapsed=0,walking=false,lastApplied=-1,lastWeather='',weather=sampleWeather(weatherAt(worldClock.now())),baseSun=0;
  const windows=[],lamps=[];
  const uniforms={top:{value:new THREE.Color()},horizon:{value:new THREE.Color()},cloud:{value:new THREE.Color()},
    sunDir:{value:new THREE.Vector3()},moonDir:{value:new THREE.Vector3()},night:{value:0},time:{value:0},cloudCover:{value:0}};
  const dome=new THREE.Mesh(new THREE.SphereGeometry(450,40,24),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,uniforms,
    vertexShader:`varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`
      uniform vec3 top,horizon,cloud,sunDir,moonDir;
      uniform float night,time,cloudCover;varying vec3 vDirection;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=noise(p)*a;p=p*2.03+vec2(13.1,7.7);a*=.5;}return v;}
      void main(){
        vec3 d=normalize(vDirection);float h=max(d.y,0.);
        vec3 color=mix(horizon,top,pow(h,.46));
        float s=max(dot(d,sunDir),0.);
        color+=vec3(1.,.56,.25)*pow(s,54.)*.20*(1.-night);
        float sunDisk=smoothstep(.99925,.99955,s)*smoothstep(-.04,.025,sunDir.y);
        color=mix(color,vec3(1.8,1.35,.78),sunDisk*(1.-night));
        vec2 uv=vec2(atan(d.z,d.x)/6.2831853+.5,asin(clamp(d.y,-1.,1.))/3.14159265+.5);
        vec2 cells=uv*vec2(650.,330.);vec2 id=floor(cells),f=fract(cells)-.5;
        float seed=hash(id);float radius=mix(.12,.29,hash(id+7.));
        float star=(1.-smoothstep(radius*.1,radius,length(f)))*step(.987,seed);
        float sparkle=.7+.3*sin(time*.85+seed*314.);
        color+=vec3(.72,.83,1.)*star*sparkle*night*smoothstep(.015,.16,d.y)*2.;
        float moonDistance=length(d-moonDir);
        float disk=1.-smoothstep(.024,.027,moonDistance);
        vec3 moonCut=normalize(moonDir+vec3(.022,.005,0.));
        float phase=smoothstep(.021,.024,length(d-moonCut));
        float halo=exp(-moonDistance*27.)*.085;
        color+=vec3(.48,.63,.93)*halo*night;
        color=mix(color,vec3(.85,.9,1.)*(.85+.15*noise(d.xz*600.)),disk*phase*night);
        vec2 p=d.xz/(h+.19)*2.0+vec2(time*.006,time*.0015);
        float density=fbm(p),edge=smoothstep(mix(.62,.30,cloudCover),mix(.76,.53,cloudCover),density)*smoothstep(.025,.16,d.y);
        vec3 shade=cloud*(.70+.3*smoothstep(.48,.74,fbm(p+vec2(.12,.20))));
        color=mix(color,shade,edge*(.92-.25*night));
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  dome.frustumCulled=false;dome.renderOrder=-1000;scene.add(dome);
  const fog=new THREE.Fog('#d6eef4',65,220);
  function precipitationTexture(kind){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d');
    if(kind==='rain'){const gradient=ctx.createLinearGradient(0,0,0,32);gradient.addColorStop(0,'#fff0');gradient.addColorStop(.35,'#ffff');gradient.addColorStop(1,'#fff0');ctx.strokeStyle=gradient;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(19,0);ctx.lineTo(12,32);ctx.stroke();}
    else{const gradient=ctx.createRadialGradient(16,16,0,16,16,15);gradient.addColorStop(0,'#fff');gradient.addColorStop(.5,'#ffff');gradient.addColorStop(1,'#fff0');ctx.fillStyle=gradient;ctx.fillRect(0,0,32,32);}
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
  }
  function precipitation(kind,count,color,size){
    const positions=new Float32Array(count*3),geometry=new THREE.BufferGeometry(),material=new THREE.PointsMaterial({color,size,map:precipitationTexture(kind),alphaTest:.02,transparent:true,opacity:0,depthWrite:false,fog:true,sizeAttenuation:true});
    for(let i=0;i<count;i++){positions[i*3]=(Math.random()-.5)*90;positions[i*3+1]=Math.random()*42-7;positions[i*3+2]=(Math.random()-.5)*90;}
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));const points=new THREE.Points(geometry,material);points.frustumCulled=false;points.renderOrder=40;scene.add(points);
    return {kind,positions,geometry,material,points,count};
  }
  const rain=precipitation('rain',reducedMotion?180:650,'#b6d5e7',.72),snow=precipitation('snow',reducedMotion?120:420,'#ffffff',.42);
  const positions=[[-21,3.35,7],[-11,3.35,7],[0,3.35,7],[11,3.35,7],[26,3.35,7],
    [-17,3.35,.5],[-8,3.35,.5],[10,3.35,.5],[19,3.35,.5],[7,3,18],[19,3,18],[-21,3.8,-14.5]];
  for(const p of positions){const lamp=new THREE.PointLight('#ffc17c',0,7.5,2);lamp.position.set(...p);scene.add(lamp);lamps.push(lamp);}
  renderer.shadowMap.autoUpdate=false;
  const clock=document.querySelector('#daylight'),weatherLabel=document.createElement('span');weatherLabel.className='weather-label';clock.append(weatherLabel);
  const color=(out,components)=>out.setRGB(...components,THREE.SRGBColorSpace);

  function apply(force=false){
    const weatherStamp=weather.type+':'+weather.mix.toFixed(2);if(!force&&Math.abs(hour-lastApplied)<.004&&weatherStamp===lastWeather)return;
    lastApplied=hour;lastWeather=weatherStamp;const state=sampleTime(hour),tint=new THREE.Color(weather.tint),cloudTint=new THREE.Color(weather.cloudTint);
    color(uniforms.top.value,state.top);color(uniforms.horizon.value,state.horizon);color(uniforms.cloud.value,state.cloud);
    uniforms.top.value.lerp(tint,.18*(1-weather.sun));uniforms.horizon.value.lerp(tint,.26*(1-weather.sun));uniforms.cloud.value.lerp(cloudTint,.68);uniforms.cloudCover.value=weather.cloud;
    uniforms.night.value=state.night;
    const direction=new THREE.Vector3(Math.cos(state.azimuth),state.elevation*.85,Math.sin(state.azimuth)*.32).normalize();
    uniforms.sunDir.value.copy(direction);uniforms.moonDir.value.copy(direction).negate();
    sun.position.copy(state.night>.8?uniforms.moonDir.value:direction).multiplyScalar(65);
    sun.position.y=Math.max(5,sun.position.y);
    sun.color.set(state.night>.8?'#a7c3ff':state.elevation<.25?'#ffc296':'#fff1dc');baseSun=state.sun*weather.sun;sun.intensity=baseSun;
    color(sky.color,state.horizon);sky.color.lerp(tint,.2*(1-weather.sun));sky.color.lerp(new THREE.Color('#7d94ba'),state.night);sky.groundColor.set(state.night>.5?'#49536c':'#66645d');sky.intensity=(state.ambient*.65+state.night*.5)*weather.ambient;
    renderer.toneMappingExposure=(.94+state.night*.28)*(.82+.18*weather.ambient);
    scene.background=uniforms.horizon.value;
    fog.color.copy(uniforms.horizon.value);fog.far=Math.max(28,state.fog*weather.visibility);fog.near=Math.min(65,fog.far*.34);scene.fog=walking?fog:null;
    ground.position.y=walking?-.14:-2.8;
    ground.material.color.set(walking?'#a8b58d':'#e3dfd4');
    for(const {material,glow} of windows){material.emissive.set(glow?'#ffc078':'#ffbd80');material.emissiveIntensity=glow?.20+state.night*2.6:state.night*.65;}
    for(const lamp of lamps)lamp.intensity=state.night*15;
    renderer.shadowMap.needsUpdate=true;
    const text=formatHour(hour);clock.querySelector('.control-label').textContent=text;clock.querySelector('.time-icon').textContent=state.night>.55?'☾':'☀';weatherLabel.textContent=weather.icon+' '+weather.name;
    document.body.dataset.time=text;document.body.dataset.light=state.night>.55?'night':hour>16&&hour<20?'sunset':'day';document.body.dataset.weather=weather.type;document.body.dataset.weatherWet=String(weather.rain>.15);
  }
  function movePrecipitation(effect,amount,dt,camera){
    effect.material.opacity=Math.min(.82,amount*.68);effect.points.visible=amount>.025;effect.points.position.copy(camera.position);if(!effect.points.visible)return;
    const fall=effect.kind==='rain'?30:4,drift=weather.wind*(effect.kind==='rain'?.42:.18),p=effect.positions;
    for(let i=0;i<effect.count;i++){const j=i*3;p[j]+=drift*dt;p[j+1]-=fall*dt;p[j+2]+=drift*.18*dt;if(p[j+1]<-8){p[j]=(Math.random()-.5)*90;p[j+1]+=42;p[j+2]=(Math.random()-.5)*90;}if(p[j]>46)p[j]-=92;}
    effect.geometry.attributes.position.needsUpdate=true;
  }
  function update(dt,camera,paused=false){
    if(!paused&&!reducedMotion)elapsed+=dt;
    hour=worldClock();weather=sampleWeather(weatherAt(worldClock.now()));
    uniforms.time.value=elapsed;dome.position.copy(camera.position);apply();movePrecipitation(rain,weather.rain,paused?0:dt,camera);movePrecipitation(snow,weather.snow,paused?0:dt,camera);
    const phase=(worldClock.now()%13000+13000)%13000,flash=weather.type==='storm'&&weather.mix>.35&&(phase<90||(phase>180&&phase<245))?1:0;sun.intensity=baseSun+flash*7;
    return true;
  }
  function registerTown(town){
    const seen=new Set();town.traverse(o=>{
      if(!o.isMesh)return;
      for(const material of Array.isArray(o.material)?o.material:[o.material]){
        if(seen.has(material))continue;seen.add(material);
        if(['glass','glassdark','glow'].includes(material.name)&&material.emissive)windows.push({material,glow:material.name==='glow'});
      }
    });apply(true);
  }
  apply(true);
  return {update,registerTown,get rain(){return weather.rain;},applyOverviewFog(target){target.color.copy(fog.color);target.far=Math.max(55,470*weather.visibility);target.near=Math.min(260,target.far*.55);},setWorldOrigin(x,z){lamps.forEach((lamp,i)=>lamp.position.set(positions[i][0]*1.35-x,positions[i][1]*1.35+4,positions[i][2]*1.35-z));},setWalking(value){walking=value;apply(true);}};
}
