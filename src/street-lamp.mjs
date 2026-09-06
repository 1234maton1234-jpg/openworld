import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export function streetLampGeometry(){
  const pole=new THREE.CylinderGeometry(.065,.13,7.65,10).translate(0,3.825,0);
  const foot=new THREE.CylinderGeometry(.16,.22,.32,10).translate(0,.16,0);
  const arm=new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0,7.5,0),new THREE.Vector3(.08,7.92,0),
    new THREE.Vector3(.55,8.12,0),new THREE.Vector3(1.18,8.12,0)
  ]),10,.055,8,false);
  const shell=new THREE.SphereGeometry(1,12,8).scale(.55,.12,.22).translate(1.3,8.1,0);
  const parts=[pole,foot,arm,shell],housing=mergeGeometries(parts);
  parts.forEach(part=>part.dispose());
  const lens=new THREE.SphereGeometry(1,12,6).scale(.44,.035,.175).translate(1.3,8.005,0);
  return [housing,lens];
}
