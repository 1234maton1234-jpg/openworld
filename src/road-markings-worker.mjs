import {roadMarkings} from './road-markings.mjs';
self.onmessage=({data})=>{
  try{self.postMessage({id:data.id,result:roadMarkings(data.roads)});}
  catch(error){self.postMessage({id:data.id,error:String(error)});}
};
