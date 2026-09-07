import * as T from 'three';
import {carSeats} from '../shared/car-seats.mjs';

export function addCarInterior(group){
  const trim=new T.MeshStandardMaterial({color:'#263432',roughness:.85}),fabric=new T.MeshStandardMaterial({color:'#53615c',roughness:1}),metal=new T.MeshStandardMaterial({color:'#adb6ad',metalness:.65,roughness:.35});
  function box(name,x,y,z,w,h,d,material=trim,parent=group){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);mesh.name=name;mesh.position.set(x,y,z);mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  box('cabin-floor',0,.43,.15,1.64,.1,2.05);
  box('headliner',0,1.71,.1,1.66,.025,2.2,fabric);
  box('dashboard',0,.98,-.77,1.6,.22,.4);
  box('center-console',0,.64,-.24,.14,.32,.8);
  for(const [i,[x,y,z]] of carSeats().entries()){
    box(i?'passenger-seat':'driver-seat',x,y-.07,z,.57,.14,.55,fabric);
    box('seat-back',x,y+.26,z+.3,.57,.64,.13,fabric);
    box('headrest',x,y+.69,z+.31,.32,.2,.12,fabric);
  }
  for(const x of [-.8,.8]){box('door-trim',x,.77,.1,.065,.36,1.85);box('armrest',x*.94,.82,.05,.12,.065,.48);box('door-handle',x*.93,.96,-.15,.025,.035,.17,metal);}
  for(const x of [-.63,.16,.63]){box('air-vent',x,1.02,-.558,.19,.075,.025);for(const y of [1,1.025,1.05])box('vent-slat',x,y,-.541,.17,.006,.008,metal);}
  const wheel=new T.Group();wheel.name='steering-wheel';wheel.position.set(-.35,.91,-.5);wheel.rotation.x=-.25;group.add(wheel);
  wheel.add(new T.Mesh(new T.TorusGeometry(.205,.019,10,40),trim));
  for(const angle of [Math.PI/2,-Math.PI/2,Math.PI]){const spoke=box('wheel-spoke',Math.sin(angle)*.095,Math.cos(angle)*.095,0,.032,.2,.025,metal,wheel);spoke.rotation.z=-angle;}
  box('wheel-hub',0,0,.012,.115,.085,.04,trim,wheel);
  box('wheel-marker',0,.204,.005,.025,.02,.025,new T.MeshStandardMaterial({color:'#d4b46c'}),wheel);
  box('instrument-housing',-.35,1.17,-.59,.38,.21,.045);
  const screen=new T.Mesh(new T.PlaneGeometry(.34,.17),new T.MeshBasicMaterial({color:'#b9dfbf',toneMapped:false}));screen.name='instrument-screen';screen.position.set(-.35,1.17,-.565);group.add(screen);
  return {wheel,screen};
}
