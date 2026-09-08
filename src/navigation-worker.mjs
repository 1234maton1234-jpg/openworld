import {createRoadNavigator} from '../shared/navigation.mjs';
let navigator=null;
self.onmessage=({data})=>{
  try{if(data.type==='roads'){navigator=createRoadNavigator(data.roads);return;}
    if(data.type==='route')self.postMessage({id:data.id,result:navigator?.route(data.start,data.target)||{status:'no-roads',points:[]}});
  }catch{navigator=null;self.postMessage({id:data.id,result:{status:'error',points:[]}});}
};
