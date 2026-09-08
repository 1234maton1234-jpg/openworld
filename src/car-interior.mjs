import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {stockCarSeats} from '../shared/car-seats.mjs';

export function addCarInterior(group,seats=stockCarSeats()){
  const trim=new T.MeshStandardMaterial({color:'#263432',roughness:.85}),fabric=new T.MeshStandardMaterial({color:'#53615c',roughness:1}),metal=new T.MeshStandardMaterial({color:'#adb6ad',metalness:.65,roughness:.35});
  function box(name,x,y,z,w,h,d,material=trim,parent=group){const mesh=new T.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(.035,w/4,h/4,d/4)),material);mesh.name=name;mesh.position.set(x,y,z);mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  box('cabin-floor',0,.43,.15,1.64,.1,2.35);
  box('headliner',0,1.53,.2,1.25,.025,1.05,fabric);
  box('dashboard',0,.8,-.97,1.6,.18,.3);
  box('center-console',0,.64,-.24,.14,.32,.8);
  for(const [i,[x,y,z]] of seats.entries()){
    box(i===0?'driver-seat':i===1?'passenger-seat':'rear-seat-'+i,x,y-.07,z,.57,.14,.55,fabric);
    box('seat-back',x,y+.26,z+.3,.57,.64,.13,fabric);
    box('headrest',x,y+.69,z+.31,.32,.2,.12,fabric);
  }
  for(const x of [-.8,.8]){box('door-trim',x,.77,.1,.065,.36,1.85);box('armrest',x*.94,.82,.05,.12,.065,.48);box('door-handle',x*.93,.96,-.15,.025,.035,.17,metal);}
  for(const x of [-.63,.16,.63]){box('air-vent',x,1.02,-.558,.19,.075,.025);for(const y of [1,1.025,1.05])box('vent-slat',x,y,-.541,.17,.006,.008,metal);}
  const wheel=new T.Group();wheel.name='steering-wheel';wheel.position.set(-.35,1.06,-.76);wheel.rotation.x=-.25;group.add(wheel);
  wheel.add(new T.Mesh(new T.TorusGeometry(.205,.019,10,40),trim));
  for(const angle of [Math.PI/2,-Math.PI/2,Math.PI]){const spoke=box('wheel-spoke',Math.sin(angle)*.095,Math.cos(angle)*.095,0,.032,.2,.025,metal,wheel);spoke.rotation.z=-angle;}
  box('wheel-hub',0,0,.012,.115,.085,.04,trim,wheel);
  box('wheel-marker',0,.204,.005,.025,.02,.025,new T.MeshStandardMaterial({color:'#d4b46c'}),wheel);
  const housing=new T.Mesh(new T.CylinderGeometry(.16,.16,.06,48),trim);housing.name='instrument-housing';housing.rotation.x=Math.PI/2;housing.position.set(-.35,1.065,-.96);group.add(housing);
  const bezel=new T.Mesh(new T.TorusGeometry(.148,.009,8,48),metal);bezel.name='instrument-bezel';bezel.position.set(-.35,1.065,-.925);group.add(bezel);
  const screen=new T.Mesh(new T.CircleGeometry(.14,64),new T.MeshBasicMaterial({color:'#b9dfbf',toneMapped:false}));screen.name='instrument-screen';screen.userData.roundDial=true;screen.position.set(-.35,1.065,-.923);group.add(screen);
  for(const part of group.children)if(['air-vent','vent-slat'].includes(part.name)){part.position.z-=.35;part.position.y-=.14;}
  return {wheel,screen};
}
