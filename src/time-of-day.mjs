const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
const key=(hour,top,horizon,cloud,sun,ambient,night,fog)=>({hour,top:rgb(top),horizon:rgb(horizon),cloud:rgb(cloud),sun,ambient,night,fog});
const KEYS=[
  key(0,'#07122e','#263b61','#344968',.13,.46,1,145),
  key(5,'#303963','#c48d98','#d4adb9',.22,.64,.82,95),
  key(6.5,'#7fafd3','#ffe0bd','#fff3e6',1.65,1.6,.04,112),
  key(10,'#398bd0','#d6eef4','#ffffff',3.15,2.05,0,220),
  key(15,'#4e98d0','#d4eaf2','#fffaf0',3.0,2.05,0,215),
  key(17.3,'#779ec8','#f8d7b2','#ffe2c5',2.65,1.8,0,170),
  key(18.3,'#766eaf','#ffb18b','#ffd0ba',1.6,1.30,.12,150),
  key(19.4,'#283866','#bc86a3','#bfa9c9',.35,.77,.68,150),
  key(21,'#0b1838','#34486d','#576184',.16,.48,1,160),
  key(24,'#07122e','#263b61','#344968',.13,.46,1,145),
];
export function advanceHour(hour,amount){return Math.round((((hour+amount)%24+24)%24)*1e8)/1e8;}
export function formatHour(hour){const minutes=Math.round(advanceHour(hour,0)*60)%1440;return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}
export function sampleTime(hour){
  const h=advanceHour(hour,0);let index=0;
  while(index<KEYS.length-2&&h>KEYS[index+1].hour)index++;
  const a=KEYS[index],b=KEYS[index+1],f=(h-a.hour)/(b.hour-a.hour),t=f*f*(3-2*f),result={};
  for(const name of ['top','horizon','cloud'])result[name]=a[name].map((v,i)=>v+(b[name][i]-v)*t);
  for(const name of ['sun','ambient','night','fog'])result[name]=a[name]+(b[name]-a[name])*t;
  result.elevation=Math.sin((h-6)/24*Math.PI*2);
  result.azimuth=(h-6)/24*Math.PI*2;
  return result;
}
