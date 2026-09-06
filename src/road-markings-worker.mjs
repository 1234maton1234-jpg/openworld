import {Scene} from 'three';
import {createCityView} from './city-view.mjs';
import {packCityMeshes} from './city-mesh-transfer.mjs';
const view=createCityView(new Scene(),()=>{},{background:false});
self.onmessage=({data})=>{
  try{const start=performance.now();view.rebuild(data.x,data.z,data.plan,data.values,true);const {meshes,transfer}=packCityMeshes(view.objects,view.materials);self.postMessage({id:data.id,meshes,lamps:view.lamps,patches:view.patches,buildMs:performance.now()-start},transfer);}
  catch(error){self.postMessage({id:data.id,error:String(error)});}
};
