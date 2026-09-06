import * as THREE from 'three';

export function grassMaterial(vertexColors=false){
  const size=256,data=new Uint8Array(size*size*4);
  let seed=1947;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const grain=random(),v=154+grain*48;
    data.set([v,v,v-9,255],(y*size+x)*4);
  }
  for(let i=0;i<9500;i++){
    const x=Math.floor(random()*size),y=Math.floor(random()*size),length=2+Math.floor(random()*5),lean=random()<.5?-1:1,dry=random()<.18,v=165+random()*65;
    for(let j=0;j<length;j++){
      const px=(x+Math.floor(j/3)*lean+size)%size,py=(y+j)%size;
      data.set(dry?[v,v-12,v-35,255]:[v-12,v,v-18,255],(py*size+px)*4);
    }
  }
  const map=new THREE.DataTexture(data,size,size);map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;
  map.generateMipmaps=true;map.anisotropy=4;map.needsUpdate=true;
  return new THREE.MeshStandardMaterial({name:'grass',color:vertexColors?'#a9ae98':'#84936b',vertexColors,map,roughness:1});
}
