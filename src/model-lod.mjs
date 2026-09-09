import * as T from 'three';

const slots=['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap'];
const materials=mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material];
export function selectModelLod(distance,current=0){
  if(current===2&&distance>100)return 2;
  if(distance>125)return 2;
  if(current>=1&&distance>35)return 1;
  return distance>50?1:0;
}
function entries(gltf){const result=[];gltf.scene.traverse(mesh=>{if(!mesh.isMesh)return;const a=gltf.parser.associations.get(mesh);if(a?.meshes===undefined||a.primitives===undefined)return;result.push({mesh,key:a.meshes+':'+a.primitives,geometry:mesh.geometry,materials:materials(mesh),maps:materials(mesh).map(m=>Object.fromEntries(slots.map(slot=>[slot,m[slot]])))});});return result;}
function cost(items){const textures=new Set();let triangles=0,textureBytes=0,draws=0;for(const item of items){triangles+=(item.geometry.index?.count||item.geometry.attributes.position.count)/3;draws++;for(const maps of item.maps)for(const texture of Object.values(maps))if(texture&&!textures.has(texture)){textures.add(texture);const image=texture.image;textureBytes+=(image?.width||1)*(image?.height||1)*4*4/3;}}return {triangles,textureBytes,draws};}
function releaseVariant(items){const geometries=new Set(),textures=new Set();for(const item of items){geometries.add(item.geometry);for(const maps of item.maps)for(const texture of Object.values(maps))if(texture)textures.add(texture);}geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());}
function releaseParsedObjects(gltf){const resources=new Set();gltf.scene.traverse(mesh=>{if(mesh.isMesh)for(const material of materials(mesh))resources.add(material);if(mesh.skeleton)resources.add(mesh.skeleton);});for(const resource of resources)resource.dispose();}
export function createModelLodManager({load,fetcher=(...args)=>fetch(...args),triangleBudget=1200000,textureBudget=256*1024*1024,drawBudget=1600}={}){
  const records=new Set(),position=new T.Vector3(),frustum=new T.Frustum(),projection=new T.Matrix4();let last=0,busy=0;
  function apply(record,level){
    const variant=record.variants.get(level);if(!variant||record.level===level)return;
    const byKey=new Map(variant.items.map(item=>[item.key,item]));
    for(const item of record.items){const next=byKey.get(item.key);if(!next)return;}
    for(const item of record.items){const next=byKey.get(item.key);item.mesh.geometry=next.geometry;for(const list of [item.materials,materials(item.mesh)])for(const [i,material] of list.entries())for(const slot of slots){const texture=next.maps[i]?.[slot]||null;if(Boolean(material[slot])!==Boolean(texture))material.needsUpdate=true;material[slot]=texture;if(texture)texture.needsUpdate=true;}item.mesh.userData.modelLod=level;}
    const previous=record.level;record.level=level;releaseVariant(record.variants.get(previous).items);if(previous)record.variants.delete(previous);
  }
  function hidden(record,value){if(record.hidden===value)return;record.hidden=value;for(const item of record.items){if(value){item.visible=item.mesh.visible;item.mesh.visible=false;}else item.mesh.visible=item.visible;}record.root.userData.assetBudgetHidden=value;}
  function remove(record){if(!records.delete(record))return;record.controller?.abort();hidden(record,false);apply(record,0);for(const [level,variant] of record.variants)if(level)releaseVariant(variant.items);record.root.userData.disposeModelLod=null;}
  async function prepare(record,level,now){
    if(busy>=2||record.loading||now<record.retry)return;record.loading=true;record.controller=new AbortController();const signal=AbortSignal.any([record.controller.signal,AbortSignal.timeout(20000)]);busy++;
    try{
      if(!record.manifest){const response=await fetcher(record.url+'?manifest=1',{credentials:'same-origin',signal});if(response.status===202){record.retry=now+3000;return;}if(!response.ok)throw new Error('Model manifest unavailable');record.manifest=await response.json();}signal.throwIfAborted();
      const spec=record.manifest.variants?.find(v=>v.level===level);if(!spec)throw new Error('Missing model detail');
      const gltf=await load(spec.url,{signal}),items=entries(gltf);releaseParsedObjects(gltf);if(!records.has(record)||signal.aborted){releaseVariant(items);return;}
      const keys=new Set(items.map(item=>item.key));if(record.items.some(item=>!keys.has(item.key))){releaseVariant(items);throw new Error('Model detail structure mismatch');}
      record.variants.set(level,{items:items.map(({mesh,materials,...item})=>item),cost:cost(items)});
    }catch{record.retry=now+15000;}finally{record.loading=false;busy--;}
  }
  return {register(gltf,url){
    if(!/^\/(assets|api\/(avatar|vehicle))\/[^?]+\.glb$/.test(url)||gltf.scene.userData.disposeModelLod)return;
    const items=entries(gltf);if(!items.length)return;gltf.scene.updateWorldMatrix(true,false);gltf.scene.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(gltf.scene).applyMatrix4(gltf.scene.matrixWorld.clone().invert());const record={root:gltf.scene,url,items,bounds,worldBounds:new T.Box3(),variants:new Map([[0,{items,cost:cost(items)}]]),level:0,hidden:false,loading:false,retry:0,manifest:null};records.add(record);gltf.scene.userData.disposeModelLod=()=>remove(record);
  },update(camera,now=performance.now()){
    if(now-last<300)return;last=now;
    camera.updateWorldMatrix(true,false);camera.getWorldPosition(position);frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const visible=[];for(const record of records){let ancestor=record.root,active=true;while(ancestor){if(!ancestor.visible){active=false;break;}ancestor=ancestor.parent;}if(!record.root.parent||!active){record.controller?.abort();continue;}record.root.updateWorldMatrix(true,false);record.worldBounds.copy(record.bounds).applyMatrix4(record.root.matrixWorld);record.distance=record.worldBounds.distanceToPoint(position);record.inView=frustum.intersectsBox(record.worldBounds);visible.push(record);}
    visible.sort((a,b)=>(b.root.userData.modelPriority||0)-(a.root.userData.modelPriority||0)||Number(b.inView)-Number(a.inView)||a.distance-b.distance);let triangles=0,textureBytes=0,draws=0;
    for(const record of visible){let level=selectModelLod(record.distance,record.level),variant=record.variants.get(level);
      if(!variant&&level&&record.inView)void prepare(record,level,now);
      if(!variant){level=record.level;variant=record.variants.get(level);}
      const exceeds=v=>triangles+v.cost.triangles>triangleBudget||textureBytes+v.cost.textureBytes>textureBudget||draws+v.cost.draws>drawBudget;
      if(exceeds(variant)){if(!record.variants.has(2)){if(record.inView)void prepare(record,2,now);}else{level=2;variant=record.variants.get(2);}}
      const hide=exceeds(variant);hidden(record,hide);if(hide)continue;
      if(record.variants.has(level))apply(record,level);const current=record.variants.get(record.level).cost;triangles+=current.triangles;textureBytes+=current.textureBytes;draws+=current.draws;
    }
    this.stats={models:visible.length,triangles,textureBytes,draws,loading:busy};
  },stats:{models:0,triangles:0,textureBytes:0,draws:0,loading:0},dispose(){for(const record of [...records])remove(record);}};
}
export function releaseModelLods(root){root.traverse(node=>node.userData.disposeModelLod?.());}
