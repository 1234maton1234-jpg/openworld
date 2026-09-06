import {Document,NodeIO} from '@gltf-transform/core';
import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mkdirSync,writeFileSync} from 'node:fs';
import {validateModel} from '../server/validate.mjs';
import {rigPilot} from './rig-pink-pilot.mjs';
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Pink pilot');doc.getRoot().setDefaultScene(scene);
const colors={skin:'#ffe1d5',pink:'#efa8be',lightPink:'#ffc8d6',darkPink:'#ce738f',gold:'#d9a350',goldLight:'#f5d18b',dark:'#43333c',dress:'#66545f',white:'#fff3ef',red:'#b95768',brown:'#673f42',eye:'#f5bc56',glass:'#b9dce4'};
const mats=new Map();
function add(g,key,p=[0,0,0],rot=[0,0,0],name=key){g.rotateX(rot[0]);g.rotateY(rot[1]);g.rotateZ(rot[2]);g.translate(...p);if(!mats.has(key)){const c=new T.Color(colors[key]);mats.set(key,doc.createMaterial(key).setBaseColorFactor([c.r,c.g,c.b,1]).setRoughnessFactor(key.startsWith('gold')?.35:.85).setMetallicFactor(key.startsWith('gold')?.55:0));}const prim=doc.createPrimitive().setMaterial(mats.get(key));for(const [a,b] of [['position','POSITION'],['normal','NORMAL']])prim.setAttribute(b,doc.createAccessor().setType('VEC3').setArray(new Float32Array(g.attributes[a].array)).setBuffer(buffer));if(g.index)prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(g.index.array)).setBuffer(buffer));scene.addChild(doc.createNode(name).setMesh(doc.createMesh().addPrimitive(prim)));g.dispose();}
function oval(key,p,s,rot=[0,0,0],name=key){add(new T.SphereGeometry(1,24,16).scale(...s),key,p,rot,name);}
function box(key,p,s,rot=[0,0,0]){add(new RoundedBoxGeometry(...s,2,Math.min(...s)*.2),key,p,rot);}
function tube(key,points,r){add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),20,r,8,false),key);}
// Complete three-dimensional silhouette, facing -Z.
oval('pink',[0,1.35,.025],[.39,.405,.31]);
oval('skin',[0,1.32,-.09],[.335,.34,.275]);
for(const side of [-1,1]){
  oval('skin',[side*.326,1.29,-.06],[.042,.067,.037]);
  oval('pink',[side*.32,1.36,-.1],[.075,.31,.16],[0,0,side*.13]);
  for(let i=0;i<3;i++)oval(i%2?'lightPink':'pink',[side*(.34+i*.012),1.1-i*.085,.075],[.083-i*.012,.084,.074],[0,0,side*(i%2?.38:-.28)],'braid');
  oval('gold',[side*.38,.87,.075],[.049,.025,.045]);
  oval('pink',[side*.38,.82,.075],[.05,.075,.043],[0,0,-side*.3]);
  oval('lightPink',[side*.09,1.64,-.14],[.035,.016,.042],[0,0,side*.3]);
}
// Swept bangs overlap the hairline but leave both eyes readable.
oval('pink',[-.11,1.53,-.285],[.16,.21,.072],[0,0,.38]);
oval('lightPink',[-.15,1.60,-.333],[.065,.06,.012],[0,0,.4]);
oval('pink',[.16,1.55,-.26],[.12,.19,.075],[0,0,-.44]);
tube('pink',[[.015,1.70,.015],[-.035,1.80,.01],[-.018,1.865,.0]],.024);
// One amber eye and one playful wink.
oval('brown',[.135,1.335,-.333],[.072,.102,.018]);
oval('white',[.135,1.328,-.346],[.062,.086,.011]);
oval('eye',[.137,1.315,-.358],[.045,.071,.008]);
oval('brown',[.138,1.336,-.367],[.023,.045,.005]);
oval('white',[.12,1.366,-.373],[.017,.022,.004]);
oval('goldLight',[.151,1.282,-.368],[.019,.014,.004]);
tube('brown',[[.067,1.40,-.33],[.115,1.428,-.344],[.175,1.415,-.323],[.203,1.39,-.302]],.009);
tube('brown',[[-.215,1.307,-.292],[-.159,1.329,-.34],[-.097,1.308,-.35]],.009);
oval('darkPink',[-.195,1.237,-.297],[.047,.018,.008]);oval('darkPink',[.204,1.238,-.29],[.042,.018,.008]);
oval('skin',[0,1.254,-.367],[.018,.026,.018]);
tube('brown',[[-.031,1.187,-.332],[0,1.176,-.341],[.038,1.194,-.328]],.005);
// Leather strap and raised gold goggles.
tube('brown',[[-.35,1.47,.025],[-.31,1.66,.035],[0,1.734,.01],[.31,1.66,.035],[.35,1.47,.025]],.035);
for(const side of [-1,1]){const p=[side*.195,1.682,-.19],rot=[-.55,side*-.24,0];add(new T.CylinderGeometry(.108,.112,.052,32).rotateX(Math.PI/2),'gold',p,rot,'goggle housing');oval('glass',[side*.195,1.70,-.223],[.087,.063,.028],rot);add(new T.TorusGeometry(.096,.014,8,32),'goldLight',[side*.195,1.69,-.214],rot,'goggle rim');oval('white',[side*.195-.024,1.715,-.247],[.029,.01,.006],rot);}
box('gold',[0,1.67,-.203],[.085,.025,.032]);
// Jacket, neck scarf, full skirt and boots.
oval('skin',[0,.984,0],[.07,.105,.068]);
add(new T.CylinderGeometry(.145,.18,.30,24).scale(1,1,.72),'dark',[0,.835,0]);
box('red',[0,.855,-.126],[.062,.24,.019],[0,0,.08]);
for(const side of [-1,1]){box('gold',[side*.088,.836,-.123],[.008,.27,.009],[0,0,-side*.07]);box('white',[side*.061,.978,-.08],[.095,.052,.032],[0,0,side*.36]);for(const y of [.77,.84,.91])oval('goldLight',[side*.111,y,-.111],[.011,.011,.009]);}
add(new T.CylinderGeometry(.171,.292,.38,40),'dress',[0,.494,0]);
for(let i=0;i<24;i++){const a=i*Math.PI/12;const points=[[Math.sin(a)*.174,.682,Math.cos(a)*.174],[Math.sin(a)*.294,.306,Math.cos(a)*.294]];tube('white',points,.0035);}
add(new T.TorusGeometry(.291,.012,8,48).rotateX(Math.PI/2),'dark',[0,.305,0]);
add(new T.CylinderGeometry(.184,.184,.05,32).scale(1,1,.93),'dark',[0,.70,0]);box('gold',[.055,.70,-.175],[.059,.044,.017]);box('dark',[.055,.70,-.187],[.035,.023,.005]);
for(const side of [-1,1]){oval('dark',[side*.10,.22,0],[.066,.145,.067]);box('dark',[side*.10,.08,-.035],[.145,.14,.22]);box('gold',[side*.10,.12,-.145],[.077,.014,.008]);box('brown',[side*.10,.018,-.035],[.149,.03,.224]);
  oval('dark',[side*.19,.88,0],[.095,.14,.10],[0,0,side*.28]);oval('white',[side*.25,.76,-.025],[.085,.105,.078],[0,0,side*.15]);oval('skin',[side*.26,.65,-.033],[.044,.063,.035]);
  add(new T.TorusGeometry(.059,.008,8,24).rotateX(Math.PI/2),'gold',[side*.257,.685,-.03]);
}
rigPilot(doc);mkdirSync('work/pink-pilot',{recursive:true});const bytes=Buffer.from(await new NodeIO().writeBinary(doc));const metrics=await validateModel(bytes,{width:2,depth:2},{avatar:true});writeFileSync('work/pink-pilot/pink-pilot.glb',bytes);console.log(JSON.stringify(metrics));
