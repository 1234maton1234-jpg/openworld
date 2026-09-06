import {createCityView} from './city-view.mjs';
import {grassMaterial} from './grass-material.mjs';
import * as THREE from 'three';
import {PLOT,hash} from '../shared/terrain.mjs';
import {createRiverWater} from './river-water.mjs';
export function createTerrain(scene,invalidate=()=>{}){
  const group=new THREE.Group();scene.add(group);
  const material=grassMaterial(true);
  const city=createCityView(scene,invalidate),water=createRiverWater(scene,{heightAt:(x,z)=>city.ground(x,z)}),townWaters=[];
  let centerKey='',origin={x:0,z:0},rows=[];const chunks=new Map();
  function surface(x,z){return city.surface(x,z);}
  let planningKey='',pending=[];
  function rebuild(x,z,values,planning){rows=values;origin={x,z};
    city.rebuild(x,z,planning,values);
    const nextKey=JSON.stringify([rows,city.planning.legacy,city.planning.hydrology,city.planning.terrain,city.planning.regions?.map(r=>[r.x,r.z,r.version])]);if(nextKey!==planningKey){planningKey=nextKey;centerKey='';}
    if(centerKey!==x+','+z){centerKey=x+','+z;water.setOrigin(x,z,planningKey);townWaters.forEach(w=>w.setOrigin(x,z));const wanted=new Set();
      pending=[];
      for(let dx=-10;dx<=10;dx++)for(let dz=-10;dz<=10;dz++){
        const near=Math.abs(dx)<=4&&Math.abs(dz)<=4,key=`${x+dx},${z+dz}`,mesh=chunks.get(key);wanted.add(key);
        if(mesh){mesh.position.set(dx*PLOT.cell,0,dz*PLOT.cell);if(mesh.userData.detail===near&&mesh.userData.revision===planningKey)continue;}
        pending.push({x:x+dx,z:z+dz,near,key,revision:planningKey,distance:dx*dx+dz*dz});
      }
      pending.sort((a,b)=>a.distance-b.distance);
      for(const [key,mesh] of chunks)if(!wanted.has(key)){group.remove(mesh);mesh.geometry.dispose();chunks.delete(key);}
    }
  }
  function buildChunk({x,z,near,key,revision}){
        const size=PLOT.cell,heights=near?[-1,0,1].flatMap(a=>[-1,0,1].map(b=>city.ground(x*size+a*size/2,z*size+b*size/2))):[];
        const shore=near&&Math.min(...heights)<2&&Math.max(...heights)>-.5,segments=shore?20:near?12:5;
        const geometry=new THREE.PlaneGeometry(size,size,segments,segments);geometry.rotateX(-Math.PI/2);const pos=geometry.attributes.position,colors=new Float32Array(pos.count*3),normals=geometry.attributes.normal,c=new THREE.Color(),normal=new THREE.Vector3();
        for(let i=0;i<pos.count;i++){const wx=x*PLOT.cell+pos.getX(i),wz=z*PLOT.cell+pos.getZ(i),h=city.ground(wx,wz),sx=city.ground(wx+.3,wz)-city.ground(wx-.3,wz),sz=city.ground(wx,wz+.3)-city.ground(wx,wz-.3);pos.setY(i,h);normal.set(-sx,.6,-sz).normalize();normals.setXYZ(i,...normal);c.set(h<1.6?'#c7c6a0':normal.y<.8?'#9da38a':h>48?'#a9b29c':h>23?'#8dab7f':'#b1c895');c.multiplyScalar(.94+hash(Math.floor(wx/7),Math.floor(wz/7),91)*.08);colors.set([c.r,c.g,c.b],i*3);}
        const uv=geometry.attributes.uv;for(let i=0;i<pos.count;i++)uv.setXY(i,(x*size+pos.getX(i))/4,(z*size+pos.getZ(i))/4);
        geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));const mesh=new THREE.Mesh(geometry,material);mesh.position.set((x-origin.x)*PLOT.cell,0,(z-origin.z)*PLOT.cell);mesh.receiveShadow=true;mesh.userData={detail:near,revision};const old=chunks.get(key);if(old){group.remove(old);old.geometry.dispose();}group.add(mesh);chunks.set(key,mesh);
  }
  function registerTown(town){town.updateMatrixWorld(true);town.traverse(o=>{
    if(!o.isMesh)return;
    if(o.material?.name==='waterlight'){o.visible=false;return;}
    if(o.material?.name!=='water')return;
    const box=new THREE.Box3().setFromObject(o),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());o.visible=false;
    const river=createRiverWater(scene,{width:size.x,length:size.z,x:center.x+origin.x*PLOT.cell,z:center.z+origin.z*PLOT.cell,height:box.max.y+.012,depth:1.2});river.setOrigin(origin.x,origin.z);townWaters.push(river);
  });}
  return {blocked:city.blocked,rebuild,surface,ground:city.ground,lotInfo:city.lotInfo,lotAt:city.pick,registerTown,interact(raycaster){return townWaters.some(w=>w.interact(raycaster))||water.interact(raycaster);},pick(raycaster){return raycaster.intersectObjects([...group.children,...city.objects],false)[0]?.point;},update(dt,sun,paused,camera){city.updateLights(camera);const start=performance.now();while(pending.length&&performance.now()-start<3)buildChunk(pending.shift());water.update(dt,sun,paused);townWaters.forEach(w=>w.update(dt,sun,paused));},get origin(){return origin;}};
}
