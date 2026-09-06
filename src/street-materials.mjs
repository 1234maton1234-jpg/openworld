import * as THREE from 'three';

export function streetMaterial(kind){
  const size=128,color=new Uint8Array(size*size*4),height=new Uint8Array(color.length);
  let seed=731;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const sidewalk=kind==='sidewalk';
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const grain=random(),seam=sidewalk&&(x%64<2||y%64<2);
    const weather=Math.sin(x/size*Math.PI*2)*Math.cos(y/size*Math.PI*4);
    const value=sidewalk?(seam?112:184+grain*18+weather*5):62+grain*22+weather*4;
    const i=(y*size+x)*4,h=seam?50:120+grain*45;
    color.set([value,value,sidewalk?value-6:value+2,255],i);height.set([h,h,h,255],i);
  }
  function texture(data,colorSpace){
    const map=new THREE.DataTexture(data,size,size);
    map.wrapS=map.wrapT=THREE.RepeatWrapping;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;
    map.generateMipmaps=true;map.anisotropy=4;map.colorSpace=colorSpace;map.needsUpdate=true;return map;
  }
  return new THREE.MeshStandardMaterial({name:kind,map:texture(color,THREE.SRGBColorSpace),bumpMap:texture(height,THREE.NoColorSpace),bumpScale:sidewalk?.018:.008,roughness:sidewalk?.92:.96});
}
