export const MODEL_RESOURCE_RULES=Object.freeze({
  maxBytes:32*1024*1024,maxTriangles:100000,maxNodes:512,maxPrimitives:200,
  maxVertices:300000,maxMaterials:64,maxTextures:16,maxTextureSize:2048,
  maxTexturePixels:16*1024*1024,maxDecodedAccessorBytes:32*1024*1024,
  maxAnimations:32,maxSkins:4,maxJointsPerSkin:128
});

export function inspectResourceDeclarations(json){
  const rules=MODEL_RESOURCE_RULES,components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},bytes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
  const reject=message=>{throw Object.assign(new Error(message),{status:400});};
  const materials=json.materials?.length||0,animations=json.animations?.length||0;
  if(materials>rules.maxMaterials)reject(`模型材质不能超过 ${rules.maxMaterials} 个`);
  if(animations>rules.maxAnimations)reject(`模型动画不能超过 ${rules.maxAnimations} 个`);
  let decodedAccessorBytes=0;
  for(const accessor of json.accessors||[]){
    if(!Number.isSafeInteger(accessor.count)||accessor.count<0||accessor.count>rules.maxVertices||!components[accessor.type]||!bytes[accessor.componentType])reject('模型访问器数量或类型无效');
    decodedAccessorBytes+=accessor.count*components[accessor.type]*bytes[accessor.componentType];
    if(decodedAccessorBytes>rules.maxDecodedAccessorBytes)reject('模型解码后的几何和动画数据不能超过 32 MiB');
  }
  return {materials,animations,decodedAccessorBytes};
}
