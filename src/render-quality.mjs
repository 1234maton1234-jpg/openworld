import {DataTexture,RepeatWrapping,LinearFilter} from 'three';

export function createWetRoads(){
  const size=64,data=new Uint8Array(size*size*4),original=new WeakMap();let current=new Set();
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const wave=Math.sin(x/size*Math.PI*2)*Math.cos(y/size*Math.PI*4),value=Math.round(170+65*wave);
    data.set([value,value,value,255],(y*size+x)*4);
  }
  const texture=new DataTexture(data,size,size);texture.wrapS=texture.wrapT=RepeatWrapping;texture.minFilter=texture.magFilter=LinearFilter;texture.needsUpdate=true;
  function restore(material){const saved=original.get(material);if(saved){Object.assign(material,saved);material.needsUpdate=true;}}
  return {
    update(scene,enabled){
      const materials=new Set(),reflectors=[];
      scene.traverse(o=>{if(!o.isMesh||Array.isArray(o.material)||o.material?.name!=='asphalt')return;const m=o.material;materials.add(m);if(enabled)reflectors.push(o);});
      for(const m of current)if(!materials.has(m))restore(m);
      for(const m of materials){
        if(!original.has(m))original.set(m,{roughness:m.roughness,roughnessMap:m.roughnessMap,metalness:m.metalness,bumpScale:m.bumpScale});
        if(enabled){if(m.roughnessMap!==texture){m.roughness=.42;m.roughnessMap=texture;m.metalness=.08;m.bumpScale=.004;m.needsUpdate=true;}}
        else if(m.roughnessMap===texture)restore(m);
      }
      current=materials;return reflectors;
    },
    dispose(){for(const m of current)restore(m);current.clear();texture.dispose();}
  };
}
