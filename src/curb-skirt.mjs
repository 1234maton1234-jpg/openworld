import * as THREE from 'three';
import {CURB_HEIGHT} from '../shared/street-style.mjs';

export function curbSkirt(geometry){
  const positions=geometry.attributes.position,index=geometry.index,edges=new Map(),point=i=>[positions.getX(i),positions.getY(i),positions.getZ(i)],key=p=>p.map(v=>Math.round(v*10000)).join(',');
  for(let i=0;i<(index?index.count:positions.count);i+=3){
    const points=[0,1,2].map(j=>point(index?index.getX(i+j):i+j));
    for(let j=0;j<3;j++){const a=points[j],b=points[(j+1)%3],ka=key(a),kb=key(b);if(ka===kb)continue;const forward=ka<kb,id=forward?ka+'|'+kb:kb+'|'+ka,sign=forward?1:-1;if(edges.has(id))edges.get(id).count+=sign;else edges.set(id,{a:forward?a:b,b:forward?b:a,count:sign});}
  }
  const vertices=[];
  for(const edge of edges.values())if(edge.count!==0){const [a,b]=edge.count>0?[edge.a,edge.b]:[edge.b,edge.a],c=[a[0],a[1]-CURB_HEIGHT,a[2]],d=[b[0],b[1]-CURB_HEIGHT,b[2]];vertices.push(...a,...c,...b,...b,...c,...d);}
  const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));result.computeVertexNormals();return result;
}
