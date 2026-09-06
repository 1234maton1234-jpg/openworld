import {CURB_HEIGHT} from '../shared/street-style.mjs';
export function createStreetCollision(){
  const bins=new Map(),size=16;
  return {set(lamps){bins.clear();for(const {p} of lamps){const key=Math.floor(p[0]/size)+','+Math.floor(p[2]/size);if(!bins.has(key))bins.set(key,[]);bins.get(key).push([p[0],p[1]+CURB_HEIGHT,p[2]]);}},blocked(x,z,y,radius=.35,height=1.7){
    const reach=radius+.22;for(let bx=Math.floor((x-reach)/size);bx<=Math.floor((x+reach)/size);bx++)for(let bz=Math.floor((z-reach)/size);bz<=Math.floor((z+reach)/size);bz++)for(const p of bins.get(bx+','+bz)||[]){if(y+height<=p[1]||y>=p[1]+8.2)continue;const pole=y<p[1]+.32?.22:.13;if(Math.hypot(x-p[0],z-p[2])<radius+pole)return true;}return false;
  }};
}
