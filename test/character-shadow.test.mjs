import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {CharacterShadow} from '../src/lighting/shadow/CharacterShadow.js';
import {CharacterShadowAdapter} from '../src/lighting/shadow/CharacterShadowAdapter.js';

function fixture(){
  const renderer={getRenderTarget:()=>null,getClearColor:c=>c.set(0),getClearAlpha:()=>1,setRenderTarget(){},setClearColor(){},clear(){}};
  const character=new T.Mesh(new T.BoxGeometry(.6,1.8,.6),new T.MeshStandardMaterial());
  const shadow=new CharacterShadow({renderer,scene:new T.Scene(),character});
  return {character,shadow};
}

test('jumping head shadows stay inside the depth range at low sun and elevated ground',()=>{
  const {character,shadow}=fixture();
  try{
    for(const ground of [0,4.335,80])for(const height of [0,1.125,3])for(const elevation of [5,15,50]){
      character.position.set(0,ground+.9+height,0);
      shadow.groundHeight=ground;
      shadow.setSunDirection(new T.Vector3(.6,-Math.tan(elevation*Math.PI/180),.8));
      shadow._updateCamera();
      for(const x of [-.3,.3])for(const z of [-.3,.3]){
        const head=new T.Vector3(x,ground+height+1.8,z);
        const hit=head.addScaledVector(shadow.sunDirection,(ground-head.y)/shadow.sunDirection.y).applyMatrix4(shadow.matrix);
        assert.ok(hit.z<=1&&hit.z>=0,`clipped head: ground=${ground}, jump=${height}, sun=${elevation}, depth=${hit.z}`);
      }
      assert.ok(Math.abs(shadow._biasUniform.value*(shadow.cam.far-shadow.cam.near)-shadow.bias)<1e-10);
      assert.equal(shadow.extent,4);
    }
  }finally{shadow.dispose();character.geometry.dispose();character.material.dispose();}
});

test('adapter resamples ground as the character changes and lands',()=>{
  const {character,shadow}=fixture(),renderer=shadow.renderer;
  shadow.dispose();renderer.shadowMap={needsUpdate:true};renderer.render=()=>{};
  const scene=new T.Scene();scene.add(character);let ground=4;
  const adapter=new CharacterShadowAdapter({renderer,scene,getGroundHeight:root=>{assert.equal(root,character);return ground;}});
  try{
    adapter.attachCharacter(character);character.position.y=ground+.9+1.125;adapter.update();
    const airborneFar=adapter.depthRange.far;
    assert.equal(adapter.shadow.groundHeight,4);
    ground=10;character.position.y=ground+.9;adapter.update();
    assert.equal(adapter.shadow.groundHeight,10);
    assert.ok(adapter.depthRange.far<airborneFar);
    assert.equal(renderer.shadowMap.needsUpdate,true);
  }finally{adapter.dispose();character.geometry.dispose();character.material.dispose();}
});
