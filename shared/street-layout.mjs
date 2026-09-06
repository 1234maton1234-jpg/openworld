import {hash} from './terrain.mjs';
export function retainStreet(id,saved=new Set()){
  if(saved.has(id))return true;
  const [direction,sx,sz]=id.split(':'),x=Number(sx),z=Number(sz);
  if((direction==='v'?x:z)%2===0)return true;
  const rx=Math.floor(x/2),rz=Math.floor(z/2),pattern=hash(rx,rz,1703);
  if(pattern<.2)return true;
  // Only interior spokes are removed; the shared perimeter stays connected.
  const first=Math.min(3,Math.floor(hash(rx,rz,1709)*4));
  const spoke=direction==='v'?(z-rz*2===0?0:2):(x-rx*2===0?3:1);
  return spoke!==first&&(pattern<.82||spoke!==(first+1)%4);
}
