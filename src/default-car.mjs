import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {addCarInterior} from './car-interior.mjs';
import {stockCarSeats} from '../shared/car-seats.mjs';

export function createDefaultCar(){
  const group=new T.Group(),wheels=[],seats=stockCarSeats();
  group.userData.occupantClipPlanes=[[1,-.3,0,1.15],[-1,-.3,0,1.15],[0,1,0,-.4],[0,-1,0,1.58],[0,-1.73,1,3.08],[0,-1.087,-1,2.495]];
  const paint=new T.MeshPhysicalMaterial({color:'#8296ac',metalness:.65,roughness:.26,clearcoat:1,clearcoatRoughness:.12,side:T.DoubleSide});
  const dark=new T.MeshStandardMaterial({color:'#182126',roughness:.75});
  const alloy=new T.MeshStandardMaterial({color:'#bfc8cc',metalness:.8,roughness:.25});
  const glass=new T.MeshPhysicalMaterial({color:'#69818e',transparent:true,opacity:.38,depthWrite:false,side:T.DoubleSide,roughness:.08,metalness:0,ior:1.5,clearcoat:1,clearcoatRoughness:.04});
  const headlight=new T.MeshStandardMaterial({color:'#ecf6ff',emissive:'#c4e3ff',emissiveIntensity:.8});
  const taillight=new T.MeshStandardMaterial({color:'#a81124',emissive:'#ff1533',emissiveIntensity:.65});
  function mesh(name,geometry,material,x=0,y=0,z=0,parent=group){const m=new T.Mesh(geometry,material);m.name=name;m.position.set(x,y,z);m.castShadow=!material.transparent;m.receiveShadow=true;parent.add(m);return m;}
  function box(name,x,y,z,w,h,d,material=paint,r=.035){return mesh(name,new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)),material,x,y,z);}
  function panel(name,points,material){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points.flat(),3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();return mesh(name,g,material);}
  function bar(name,a,b,width,material=paint){
    const start=new T.Vector3(...a),end=new T.Vector3(...b),m=box(name,0,0,0,width,start.distanceTo(end),width,material,.01);m.position.copy(start).add(end).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),end.sub(start).normalize());return m;
  }
  const sections=[[-2,.75,.81],[-1.85,.84,.91],[-1.35,.9,1.02],[-1.22,.9,1.06],[.35,.9,1.1],[1.31,.9,1.08],[1.7,.85,.96],[2,.78,.87]],positions=[],indices=[];
  for(const [z,w,h] of sections)for(const [x,y] of [[-w,.8],[-w,h-.065],[-w*.88,h],[0,h+.025],[w*.88,h],[w,h-.065],[w,.8]])positions.push(x,y,z);
  for(let i=1;i<sections.length;i++)for(let j=0;j<6;j++){if(i>=4&&i<=5&&(j===2||j===3))continue;const a=(i-1)*7+j,b=i*7+j;indices.push(a,b,a+1,a+1,b,b+1);}
  const shell=new T.BufferGeometry();shell.setAttribute('position',new T.Float32BufferAttribute(positions,3));shell.setIndex(indices);shell.computeVertexNormals();mesh('sculpted-body',shell,paint);
  const roofPoints=[],roofIndices=[],roofSteps=24;
  for(let j=0;j<=roofSteps;j++){const t=j/roofSteps,z=-.4+t*1.2,w=.66+.025*Math.sin(t*Math.PI),h=1.55+.065*Math.sin(t*Math.PI);for(let i=0;i<=12;i++){const u=i/6-1;roofPoints.push(u*w,h+.035*(1-u*u),z);}}
  for(let j=0;j<roofSteps;j++)for(let i=0;i<12;i++){const a=j*13+i,b=a+13;roofIndices.push(a,b,a+1,a+1,b,b+1);}
  const roof=new T.BufferGeometry();roof.setAttribute('position',new T.Float32BufferAttribute(roofPoints,3));roof.setIndex(roofIndices);roof.computeVertexNormals();mesh('roof',roof,paint);
  panel('windshield',[[-.8,1.075,-1.22],[.8,1.075,-1.22],[.66,1.55,-.4],[-.66,1.55,-.4]],glass);
  panel('rear-window',[[.79,1.09,1.31],[-.79,1.09,1.31],[-.665,1.55,.84],[.665,1.55,.84]],glass);
  for(const side of [-1,1]){
    const outline=new T.Shape();outline.moveTo(-2,.81);outline.lineTo(2,.81);outline.lineTo(2,.38);outline.lineTo(1.69,.38);
    outline.absarc(1.28,.38,.41,0,Math.PI,false);outline.lineTo(-.87,.38);outline.absarc(-1.28,.38,.41,0,Math.PI,false);outline.lineTo(-2,.38);outline.closePath();
    const skirt=new T.ShapeGeometry(outline,24),p=skirt.attributes.position;for(let i=0;i<p.count;i++){const z=p.getX(i);p.setXYZ(i,side*(.9-.15*Math.pow(Math.abs(z)/2,6)),p.getY(i),z);}skirt.computeVertexNormals();
    mesh('wheel-arch-body',skirt,paint);
    panel('front-door-window',[[side*.805,1.105,-1.18],[side*.817,1.13,.1],[side*.685,1.61,.1],[side*.66,1.55,-.4]],glass);
    panel('rear-door-window',[[side*.817,1.13,.16],[side*.79,1.115,1.31],[side*.66,1.55,.8],[side*.685,1.61,.16]],glass);
    bar('a-pillar',[side*.825,1.07,-1.23],[side*.68,1.57,-.41],.052);
    bar('b-pillar',[side*.825,1.105,.13],[side*.697,1.635,.13],.046,dark);
    panel('c-pillar',[[side*.81,1.075,1.45],[side*.81,1.075,1.25],[side*.69,1.575,.8],[side*.69,1.575,.9]],paint);
    bar('window-lower-trim',[side*.83,1.095,-1.2],[side*.83,1.105,1.28],.024,dark);
    bar('window-upper-trim',[side*.67,1.57,-.4],[side*.697,1.63,.14],.022,dark);
    bar('window-upper-trim',[side*.697,1.63,.14],[side*.67,1.57,.8],.022,dark);
    box('sill',side*.872,.385,.03,.075,.09,1.65,dark);
    for(const z of [-.1,.88]){
      box('flush-handle',side*.902,1.025,z,.014,.024,.16,dark,.005);
      bar('door-seam',[side*.902,.48,z+.25],[side*.902,1.04,z+.25],.009,dark);
    }
    bar('mirror-stalk',[side*.82,1.12,-.72],[side*.9,1.16,-.73],.035,dark);
    box('mirror',side*.89,1.17,-.76,.1,.085,.19,paint,.03);
    box('mirror-glass',side*.891,1.17,-.662,.078,.055,.008,alloy,.002);
    for(const z of [-1.28,1.28]){
      const pivot=new T.Group(),spin=new T.Group();pivot.position.set(side*.83,.35,z);pivot.add(spin);group.add(pivot);
      mesh('tire',new T.CylinderGeometry(.35,.35,.19,40),dark,0,0,0,spin).rotation.z=Math.PI/2;
      mesh('rim-barrel',new T.CylinderGeometry(.274,.274,.195,40),dark,0,0,0,spin).rotation.z=Math.PI/2;
      for(const face of [-1,1]){
        const lip=mesh('rim-lip',new T.TorusGeometry(.267,.012,8,40),alloy,face*.099,0,0,spin);lip.rotation.y=Math.PI/2;
        mesh('brake-disc',new T.CylinderGeometry(.215,.215,.008,32),alloy,face*.08,0,0,spin).rotation.z=Math.PI/2;
        mesh('brake-caliper',new T.BoxGeometry(.025,.12,.055),taillight,face*.085,.04,.19,pivot);
        for(let i=0;i<5;i++)for(const offset of [-.065,.065]){const a=i*Math.PI*2/5+offset;const spoke=mesh('wheel-spoke',new T.BoxGeometry(.018,.225,.025),alloy,face*.11,Math.cos(a)*.137,Math.sin(a)*.137,spin);spoke.rotation.x=a;}
        mesh('wheel-hub',new T.CylinderGeometry(.06,.06,.02,16),alloy,face*.105,0,0,spin).rotation.z=Math.PI/2;
      }
      wheels.push({pivot,spin,radius:.35,front:z<0});
    }
    box('headlight-housing',side*.56,.755,-1.977,.48,.065,.035,dark,.025);
    box('headlight',side*.56,.775,-2.002,.43,.022,.016,headlight,.008);
    box('headlight-return',side*.772,.75,-2.002,.024,.055,.018,headlight,.005);
    box('bumper-inlet',side*.66,.56,-1.99,.23,.14,.04,dark,.025);
    box('taillight',side*.59,.868,1.995,.43,.035,.025,taillight,.012);
    box('exhaust',side*.58,.41,1.985,.23,.065,.06,alloy,.025);
  }
  box('front-bumper',0,.58,-1.92,1.6,.32,.17,paint,.07);
  box('front-grille',0,.59,-2.017,.88,.15,.026,dark,.025);
  for(const y of [.55,.6,.65])box('grille-fin',0,y,-2.033,.8,.012,.009,alloy,.003);
  box('front-splitter',0,.395,-1.94,1.66,.055,.15,dark,.018);
  box('rear-bumper',0,.58,1.93,1.63,.33,.14,paint,.055);
  box('rear-light-bar',0,.872,2.009,1.5,.018,.019,taillight,.005);
  box('deck-spoiler',0,.96,1.78,1.63,.035,.17,dark,.012);
  box('rear-diffuser',0,.425,1.994,1.05,.1,.045,dark,.015);
  for(const x of [-.35,-.175,0,.175,.35])box('diffuser-fin',x,.407,1.99,.019,.07,.13,dark,.005);
  box('rear-plate',0,.66,2.008,.32,.1,.012,alloy,.008);
  addCarInterior(group,seats);
  return {group,wheels,pedals:[],seats};
}
