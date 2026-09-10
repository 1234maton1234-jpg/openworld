export const WEATHER_PERIOD=12*60*1000;
export const WEATHER_TRANSITION=60*1000;
export const WEATHER_SEQUENCE=Object.freeze(['clear','partly-cloudy','overcast','rain','clear','fog','storm','partly-cloudy','snow','overcast']);
export const WEATHER=Object.freeze({
  clear:{name:'晴朗',icon:'☀',cloud:.08,visibility:1,sun:1,ambient:1,rain:0,snow:0,wind:1,tint:'#ffffff',cloudTint:'#ffffff'},
  'partly-cloudy':{name:'多云',icon:'⛅',cloud:.42,visibility:.94,sun:.82,ambient:.96,rain:0,snow:0,wind:2,tint:'#dce8ef',cloudTint:'#d8e0e4'},
  overcast:{name:'阴天',icon:'☁',cloud:.82,visibility:.76,sun:.42,ambient:.82,rain:0,snow:0,wind:3,tint:'#aebdc7',cloudTint:'#929da5'},
  fog:{name:'雾',icon:'≋',cloud:.68,visibility:.28,sun:.34,ambient:.9,rain:0,snow:0,wind:.4,tint:'#cbd3d2',cloudTint:'#bdc6c6'},
  rain:{name:'雨',icon:'☂',cloud:.9,visibility:.56,sun:.3,ambient:.72,rain:1,snow:0,wind:5,tint:'#8297a8',cloudTint:'#687681'},
  storm:{name:'雷雨',icon:'ϟ',cloud:1,visibility:.4,sun:.16,ambient:.58,rain:1.35,snow:0,wind:9,tint:'#5f7188',cloudTint:'#465361'},
  snow:{name:'雪',icon:'❄',cloud:.86,visibility:.62,sun:.48,ambient:1.05,rain:0,snow:1,wind:2.5,tint:'#dce8ed',cloudTint:'#d5dfe2'}
});

const mod=(value,length)=>((value%length)+length)%length;
const smooth=value=>value*value*(3-2*value);
export function weatherAt(timestamp){
  const slot=Math.floor(timestamp/WEATHER_PERIOD),offset=mod(timestamp,WEATHER_PERIOD),index=mod(slot,WEATHER_SEQUENCE.length);
  return {type:WEATHER_SEQUENCE[index],previous:WEATHER_SEQUENCE[mod(index-1,WEATHER_SEQUENCE.length)],mix:smooth(Math.min(1,offset/WEATHER_TRANSITION))};
}

export function sampleWeather(state){
  const a=WEATHER[state.previous],b=WEATHER[state.type],mix=state.mix,result={type:state.type,name:b.name,icon:b.icon,mix};
  for(const key of ['cloud','visibility','sun','ambient','rain','snow','wind'])result[key]=a[key]+(b[key]-a[key])*mix;
  result.tint=mix<.5?a.tint:b.tint;result.cloudTint=mix<.5?a.cloudTint:b.cloudTint;return result;
}
