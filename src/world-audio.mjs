const WALK_INTERVAL=.48,RUN_INTERVAL=.32;

export function advanceStepClock(clock,dt,moving,running){
  if(!moving)return {clock:0,steps:0};
  const interval=running?RUN_INTERVAL:WALK_INTERVAL,total=clock+dt,steps=Math.floor(total/interval);return {clock:total-steps*interval,steps};
}

export function createWorldAudio(){
  let context=null,master=null,rainGain=null,stepClock=0,stepSide=0,stepBuffers=[];
  function noiseBuffer(duration,decay=0){
    const length=Math.ceil(context.sampleRate*duration),buffer=context.createBuffer(1,length,context.sampleRate),data=buffer.getChannelData(0);let last=0;
    for(let i=0;i<length;i++){last=last*.72+(Math.random()*2-1)*.28;data[i]=last*(decay?Math.exp(-i/length*decay):1);}return buffer;
  }
  function ensure(){
    if(context){if(context.state==='suspended')void context.resume();return;}
    const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;
    try{
      context=new AudioContext();master=context.createGain();master.gain.value=.55;master.connect(context.destination);
      const rainSource=context.createBufferSource(),high=context.createBiquadFilter(),low=context.createBiquadFilter();rainGain=context.createGain();rainGain.gain.value=0;
      rainSource.buffer=noiseBuffer(2);rainSource.loop=true;high.type='highpass';high.frequency.value=650;low.type='lowpass';low.frequency.value=7200;
      rainSource.connect(high);high.connect(low);low.connect(rainGain);rainGain.connect(master);rainSource.start();stepBuffers=[noiseBuffer(.12,5.5),noiseBuffer(.12,6.5)];void context.resume();
    }catch{context=null;master=null;rainGain=null;}
  }
  function footstep(running){
    if(!context||context.state!=='running')return;const now=context.currentTime,source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain(),panner=context.createStereoPanner?.();
    source.buffer=stepBuffers[stepSide];filter.type='bandpass';filter.frequency.value=(stepSide?620:520)+(running?120:0);filter.Q.value=.72;
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(running?.15:.105,now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+.115);
    source.connect(filter);filter.connect(gain);if(panner){panner.pan.value=stepSide?-.13:.13;gain.connect(panner);panner.connect(master);}else gain.connect(master);
    source.start(now);source.stop(now+.12);stepSide=1-stepSide;
  }
  const unlock=()=>ensure();document.addEventListener('pointerdown',unlock,{capture:true,passive:true});document.addEventListener('keydown',unlock,{capture:true});
  document.addEventListener('visibilitychange',()=>{if(rainGain)rainGain.gain.setTargetAtTime(document.hidden?0:Math.min(.2,Number(document.body.dataset.weatherRain)||0),context.currentTime,.12);});
  return {update(dt,{moving=false,running=false,rain=0}={}){const result=advanceStepClock(stepClock,dt,moving,running);stepClock=result.clock;for(let i=0;i<result.steps;i++)footstep(running);if(rainGain)rainGain.gain.setTargetAtTime(document.hidden?0:Math.min(.2,Math.max(0,rain)*.14),context.currentTime,.35);document.body.dataset.weatherRain=String(rain);}};
}
