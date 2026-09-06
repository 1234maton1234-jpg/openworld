import {axis,blockAt} from './city-plan.mjs';
import {hash} from './world-noise.mjs';
import {roadProfile} from './road-hierarchy.mjs';
export const RIVER_RESERVE=64;
const boundary=(n,direction)=>axis(n)+(n%2===0?0:Math.round((hash(n,direction,1851)-.5)*80/8)*8);
export function constructionCoordinate(value,direction){const n=blockAt(value),t=(value-axis(n))/(axis(n+1)-axis(n));return boundary(n,direction)*(1-t)+boundary(n+1,direction)*t;}
export function retainDryLocal(road,water){
  if(water.version!==3||roadProfile(road.id).class!=='local')return true;
  for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],count=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/8));for(let j=0;j<=count;j++){const t=j/count;if(water.distance(a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t)<RIVER_RESERVE+20)return false;}}
  return true;
}
