import * as T from 'three';

export function createGroundNavigation(scene,origin){
  const group=new T.Group();group.name='local-navigation';scene.add(group);let anchor={x:0,z:0};
  const pixels=new Uint8Array(64*4);
  for(let i=0;i<64;i++){const t=Math.abs((i+.5)/64*2-1),alpha=Math.pow(1-t,3);pixels.set([255,255,255,Math.round(alpha*255)],i*4);}
  const feather=new T.DataTexture(pixels,64,1,T.RGBAFormat);feather.magFilter=T.LinearFilter;feather.minFilter=T.LinearFilter;feather.needsUpdate=true;
  const core=new T.MeshBasicMaterial({color:'#b694ff',map:feather,transparent:true,opacity:.9,toneMapped:false,side:T.DoubleSide,depthWrite:false});
  const glow=new T.MeshBasicMaterial({color:'#9462ee',map:feather,toneMapped:false,transparent:true,opacity:.22,blending:T.AdditiveBlending,side:T.DoubleSide,depthWrite:false});
  const arrowMaterial=new T.MeshBasicMaterial({color:'#d4baff',transparent:true,opacity:.85,toneMapped:false,side:T.DoubleSide,depthWrite:false});
  const viewport={value:new T.Vector2(1,1)},routeLength={value:0};
  for(const material of [core,glow,arrowMaterial]){
    const ribbonMaterial=material!==arrowMaterial;
    material.fog=false;
    // Asphalt and road markings use -4 / -6; keep navigation above their depth bias.
    material.polygonOffset=true;material.polygonOffsetFactor=-8;material.polygonOffsetUnits=-8;
    material.onBeforeCompile=shader=>{
      shader.uniforms.navViewport=viewport;shader.uniforms.navLength=routeLength;
      shader.vertexShader=`varying vec3 navViewPosition;\n${ribbonMaterial?'attribute vec3 navCenter; attribute float navAlong; varying float navProgress; uniform vec2 navViewport;':''}\n`+shader.vertexShader;
      if(ribbonMaterial)shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`
        vec4 navView=modelViewMatrix*vec4(navCenter,1.0);
        float navScale=clamp(6.0*max(0.0,-navView.z)/(max(navViewport.y,1.0)*projectionMatrix[1][1]*.38),1.0,4.0);
        transformed+=(position-navCenter)*(navScale-1.0);
        navProgress=navAlong;
        #include <project_vertex>
      `);
      shader.vertexShader=shader.vertexShader.replace('#include <fog_vertex>','#include <fog_vertex>\nnavViewPosition=mvPosition.xyz;');
      shader.fragmentShader=`varying vec3 navViewPosition;\n${ribbonMaterial?'varying float navProgress; uniform float navLength;':''}\n`+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`diffuseColor.a*=1.0-smoothstep(120.0,320.0,length(navViewPosition));\n${ribbonMaterial?'diffuseColor.a*=smoothstep(0.0,2.5,navProgress)*smoothstep(0.0,2.5,navLength-navProgress);':''}\n#include <opaque_fragment>`);
    };
    material.customProgramCacheKey=()=>ribbonMaterial?'navigation-ribbon-distance-v2':'navigation-arrow-distance-v2';
  }
  function rebase(){const o=origin();group.position.set(anchor.x-o.x*70,0,anchor.z-o.z*70);}
  function clear(){for(const mesh of [...group.children]){mesh.geometry.dispose();mesh.dispose?.();group.remove(mesh);}group.visible=false;}
  function ribbon(points,width,lift){
    const vertices=[],uvs=[],centers=[],along=[];let distance=0;
    for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[2]-a[2]);if(length<.01)continue;const x=-(b[2]-a[2])/length*width/2,z=(b[0]-a[0])/length*width/2;
      const p=[a[0]-anchor.x+x,a[1]+lift,a[2]-anchor.z+z],q=[a[0]-anchor.x-x,a[1]+lift,a[2]-anchor.z-z],r=[b[0]-anchor.x+x,b[1]+lift,b[2]-anchor.z+z],s=[b[0]-anchor.x-x,b[1]+lift,b[2]-anchor.z-z];vertices.push(...p,...q,...r,...q,...s,...r);uvs.push(0,0,1,0,0,1,1,0,1,1,0,1);
      const ac=[a[0]-anchor.x,a[1]+lift,a[2]-anchor.z],bc=[b[0]-anchor.x,b[1]+lift,b[2]-anchor.z];centers.push(...ac,...ac,...bc,...ac,...bc,...bc);along.push(distance,distance,distance+length,distance,distance+length,distance+length);distance+=length;
    }routeLength.value=distance;const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geometry.setAttribute('navCenter',new T.Float32BufferAttribute(centers,3));geometry.setAttribute('navAlong',new T.Float32BufferAttribute(along,1));geometry.computeBoundingSphere();geometry.boundingSphere.radius+=width*2;return geometry;
  }
  return {group,rebase,setRoute(points){
    clear();if(!Array.isArray(points)||points.length<2||points.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)))return;
    points=points.filter((p,i)=>!i||Math.hypot(p[0]-points[i-1][0],p[2]-points[i-1][2])>=.01);if(points.length<2)return;
    anchor={x:points[0][0],z:points[0][2]};
    const halo=new T.Mesh(ribbon(points,1.1,.1),glow),line=new T.Mesh(ribbon(points,.38,.12),core);halo.renderOrder=5;line.renderOrder=6;for(const mesh of [halo,line])mesh.onBeforeRender=renderer=>renderer.getDrawingBufferSize(viewport.value);group.add(halo,line);
    const markers=[];let traveled=0,next=7;
    for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[2]-a[2]);if(length<.01)continue;
      while(next<=traveled+length&&markers.length<2048){const t=(next-traveled)/length;markers.push({x:a[0]+(b[0]-a[0])*t-anchor.x,y:a[1]+(b[1]-a[1])*t+.16,z:a[2]+(b[2]-a[2])*t-anchor.z,yaw:Math.atan2(-(b[0]-a[0]),-(b[2]-a[2]))});next+=14;}traveled+=length;
    }
    if(markers.length){const shape=new T.Shape([new T.Vector2(-.48,-.26),new T.Vector2(0,.12),new T.Vector2(.48,-.26),new T.Vector2(.48,-.1),new T.Vector2(0,.3),new T.Vector2(-.48,-.1)]),geometry=new T.ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);
      const arrows=new T.InstancedMesh(geometry,arrowMaterial,markers.length),dummy=new T.Object3D();arrows.name='navigation-arrows';arrows.renderOrder=7;
      markers.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.y=p.yaw;dummy.updateMatrix();arrows.setMatrixAt(i,dummy.matrix);});arrows.instanceMatrix.needsUpdate=true;arrows.computeBoundingSphere();group.add(arrows);
    }group.visible=true;rebase();
  },dispose(){clear();core.dispose();glow.dispose();arrowMaterial.dispose();feather.dispose();group.removeFromParent();}};
}
