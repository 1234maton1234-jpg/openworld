import {Quaternion,Euler,Vector3} from 'three';
export function rigPilot(doc){
 const scene=doc.getRoot().listScenes()[0],buffer=doc.getRoot().listBuffers()[0],meshes=scene.listChildren().filter(n=>n.getMesh());
 const definitions=[['hips',null,[0,.68,0]],['spine','hips',[0,.85,0]],['neck','spine',[0,1.0,0]],['head','neck',[0,1.32,0]]];
 for(const [s,x] of [['L',-1],['R',1]])definitions.push([s+'UpperArm','spine',[x*.19,.88,0]],[s+'Forearm',s+'UpperArm',[x*.25,.76,-.025]],[s+'Hand',s+'Forearm',[x*.26,.65,-.033]],[s+'Thigh','hips',[x*.1,.38,0]],[s+'Calf',s+'Thigh',[x*.1,.21,0]],[s+'Foot',s+'Calf',[x*.1,.08,-.035]]);
 const bones=new Map(),points=new Map(definitions.map(([name,,p])=>[name,p]));
 for(const [name,parent,p] of definitions){const node=doc.createNode(name),base=parent?points.get(parent):[0,0,0];node.setTranslation(p.map((v,i)=>v-base[i]));bones.set(name,node);if(parent)bones.get(parent).addChild(node);else scene.addChild(node);}
 const skin=doc.createSkin('openworld humanoid').setSkeleton(bones.get('hips')),inverse=[];for(const [name,,p] of definitions){skin.addJoint(bones.get(name));inverse.push(1,0,0,0,0,1,0,0,0,0,1,0,-p[0],-p[1],-p[2],1);}skin.setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(new Float32Array(inverse)).setBuffer(buffer));
 const index=name=>definitions.findIndex(d=>d[0]===name);
 for(const node of meshes){node.setSkin(skin);for(const primitive of node.getMesh().listPrimitives()){
  const position=primitive.getAttribute('POSITION'),joints=new Uint16Array(position.getCount()*4),weights=new Float32Array(position.getCount()*4),color=primitive.getMaterial()?.getName()||'dark';
  let cx=0,cy=0;for(let i=0;i<position.getCount();i++){const p=position.getElement(i,[]);cx+=p[0];cy+=p[1];}cx/=position.getCount();cy/=position.getCount();
  for(let i=0;i<position.getCount();i++){const [x,y]=position.getElement(i,[]),side=cx<0?'L':'R';let a='hips',b='spine',t=Math.max(0,Math.min(1,(y-.72)/.15));
   if(cy>1.02||['pink','lightPink','darkPink'].includes(color)){a=b='head';t=0;}
   else if(Math.abs(cx)>.185&&cy>.61&&cy<.99){a=side+'UpperArm';b=side+'Forearm';t=Math.max(0,Math.min(1,(.82-y)/.12));if(cy<.69){a=b=side+'Hand';t=0;}}
   else if(cy<.3){a=side+'Thigh';b=side+'Calf';t=Math.max(0,Math.min(1,(.27-y)/.12));if(cy<.14){a=b=side+'Foot';t=0;}}
   joints[i*4]=index(a);joints[i*4+1]=index(b);weights[i*4]=1-t;weights[i*4+1]=t;
  }
  primitive.setAttribute('JOINTS_0',doc.createAccessor().setType('VEC4').setArray(joints).setBuffer(buffer));primitive.setAttribute('WEIGHTS_0',doc.createAccessor().setType('VEC4').setArray(weights).setBuffer(buffer));
 }}
 for(const name of ['idle','walk','run','sit','cycle']){const duration=name==='run'?.65:name==='walk'?1:name==='cycle'?1:2,animation=doc.createAnimation(name),times=Float32Array.from({length:33},(_,i)=>i/32*duration),input=doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer);
  for(const [bone] of definitions){const values=[];for(let i=0;i<33;i++){const phase=i/32*Math.PI*2+(bone.startsWith('R')?Math.PI:0);let angle=0,z=0;
   if(name==='idle'&&bone==='spine')angle=Math.sin(phase)*.018;
   if(name==='walk'||name==='run'){const amplitude=name==='run'?.8:.45;if(bone.endsWith('Thigh'))angle=Math.sin(phase)*amplitude;if(bone.endsWith('Calf'))angle=-Math.max(0,-Math.sin(phase))*.65;if(bone.endsWith('UpperArm'))angle=-Math.sin(phase)*amplitude*.65;if(bone.endsWith('Forearm'))angle=.12;}
   if(name==='sit'||name==='cycle'){if(bone.endsWith('Thigh'))angle=1.25+(name==='cycle'?Math.cos(phase)*.5:0);if(bone.endsWith('Calf'))angle=-1.35+(name==='cycle'?Math.sin(phase)*.55:0);if(bone.endsWith('UpperArm'))angle=name==='cycle'?1.1:.35;if(bone.endsWith('Forearm'))angle=.35;if(bone==='spine')angle=name==='cycle'?-.25:0;}
   values.push(...new Quaternion().setFromEuler(new Euler(angle,0,z)).toArray());}
   const output=doc.createAccessor().setType('VEC4').setArray(new Float32Array(values)).setBuffer(buffer),sampler=doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setSampler(sampler).setTargetNode(bones.get(bone)).setTargetPath('rotation'));
  }
 }
}
