import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrbanTerrain} from '../shared/urban-terrain.mjs';
import {createCoastalHydrology} from '../shared/coastal-hydrology.mjs';
import * as THREE from 'three';

test('dry bridge approaches lower their foundation without raising the river under the deck',()=>{
  const water={distance:(x,z)=>Math.abs(z)<30?0:200,bedDepth:()=>5},field=createUrbanTerrain([],water,{version:4}),section={kind:'crossing',width:28,deckStart:1,deckEnd:3,points:[[0,4.335,-100],[0,5,-40],[0,7,0],[0,5,40],[0,4.335,100]]},roads=[{width:28,sections:[section]}];
  assert.ok(field.ground(0,-90,[],[],roads)<4.446);assert.ok(field.ground(0,90,[],[],roads)<4.446);assert.ok(field.ground(0,0,[],[],roads)<0);
});

test('terrain triangles stay below asphalt along angled road edges at both detail levels',()=>{
  const water={distance:()=>200};
  for(const segments of [5,12])for(const angle of [0,.43,1.1]){
    const dx=Math.cos(angle),dz=Math.sin(angle),roads=[{width:10,points:[[-150*dx,4.335,-150*dz],[150*dx,4.335,150*dz]]}],field=createUrbanTerrain([],water,{version:4}),g=new THREE.PlaneGeometry(70,70,segments,segments);g.rotateX(-Math.PI/2);
    const pos=g.attributes.position,index=g.index;
    for(let i=0;i<pos.count;i++)pos.setY(i,field.ground(pos.getX(i),pos.getZ(i),[],[],roads));
    for(let i=0;i<index.count;i+=3){const p=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(pos,index.getX(i+j)));
      for(let u=0;u<=10;u++)for(let v=0;v<=10-u;v++){const q=p[0].clone().multiplyScalar(u/10).addScaledVector(p[1],v/10).addScaledVector(p[2],1-(u+v)/10);if(Math.abs(q.x*dz-q.z*dx)<=5)assert.ok(q.y<4.347,'Grass must stay below the rendered road');}
    }g.dispose();
  }
});
test('flat terrain keeps buildable land level across the world and preserves riverbeds',()=>{
  const water=createCoastalHydrology(),field=createUrbanTerrain([],water,{version:4});
  let dry=0;for(let x=-12000;x<=12000;x+=600)for(let z=-12000;z<=12000;z+=600){assert.equal(field.base(x,z),4.3);if(water.distance(x,z)>=200){dry++;assert.equal(field.ground(x,z),4.55);}}
  assert.ok(dry>100);for(const z of [-12000,0,12000])assert.ok(field.ground(water.main(0,z).x,z)<0);
});
