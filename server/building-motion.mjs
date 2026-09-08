import {Matrix4,Vector3} from 'three';
import {isConvex} from '../shared/polygon-land.mjs';

export function validateBuildingMotion(scene,bounds,plot,{avatar=false,vehicle=false}={}){
  const nodes=[],parents=new Map();function visit(node,parent){nodes.push(node);parents.set(node,parent);for(const child of node.listChildren())visit(child,node);}for(const node of scene.listChildren())visit(node,null);
  const wheels=nodes.filter(n=>n.getExtras().openworldMotion!==undefined);if(!wheels.length)return;
  const reject=message=>{throw Object.assign(new Error(message),{status:400});};
  if(avatar||vehicle||wheels.length>4)reject('建筑最多支持 4 个摩天轮，角色和载具不能包含建筑动态部件');
  const width=plot?.width||64,depth=plot?.depth||64,poly=plot?.polygon?.map(([x,z])=>[x-plot.cx,z-plot.cz])||[[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]];
  if(!isConvex(poly))reject('动态建筑需要凸多边形领地');
  const area=poly.reduce((sum,a,i)=>{const b=poly[(i+1)%poly.length];return sum+a[0]*b[1]-b[0]*a[1];},0),sign=Math.sign(area);
  const planes=poly.map((a,i)=>{const b=poly[(i+1)%poly.length],nx=sign*(b[1]-a[1]),nz=-sign*(b[0]-a[0]);return {nx,nz,limit:nx*a[0]+nz*a[1]};});
  const center=[(bounds.min[0]+bounds.max[0])/2,(bounds.min[2]+bounds.max[2])/2];
  for(const wheel of wheels){
    const spec=wheel.getExtras().openworldMotion;
    if(spec?.type!=='ferrisWheel'||!Number.isFinite(spec.period)||spec.period<30||spec.period>600)reject('摩天轮周期必须为 30～600 秒');
    for(let p=parents.get(wheel);p;p=parents.get(p))if(wheels.includes(p))reject('动态部件不能嵌套');
    const rotors=wheel.listChildren().filter(n=>n.getExtras().motionPart==='rotor');if(rotors.length!==1)reject('摩天轮必须包含一个转子');
    const rotor=rotors[0],cabins=rotor.listChildren().filter(n=>n.getExtras().motionPart==='cabin');
    if(cabins.length<4||cabins.length>32||rotor.getRotation().slice(0,3).some(v=>Math.abs(v)>1e-6))reject('摩天轮须有 4～32 个座舱，转子初始旋转必须为零');
    const matrix=new Matrix4().fromArray(rotor.getWorldMatrix()),m=matrix.elements,scale=Math.hypot(m[0],m[1],m[2]);
    if(scale<1e-6||Math.abs(m[4])+Math.abs(m[6])+Math.abs(m[1])+Math.abs(m[9])>1e-6||m[5]<=0||Math.abs(Math.hypot(m[8],m[9],m[10])-scale)>1e-6||Math.abs(m[5]-scale)>1e-6||Math.abs(m[0]*m[8]+m[2]*m[10])>1e-6)reject('摩天轮须保持竖直且使用等比缩放');
    const inverse=matrix.clone().invert(),q=new Vector3();
    function check(node,cabin){
      if(cabins.includes(node))cabin=node;
      const transform=inverse.clone().multiply(new Matrix4().fromArray(node.getWorldMatrix())),pivot=cabin?.getTranslation();
      for(const primitive of node.getMesh()?.listPrimitives()||[]){const pos=primitive.getAttribute('POSITION');for(let i=0;i<pos.getCount();i++){
        q.fromArray(pos.getElement(i,[])).applyMatrix4(transform);
        const x=pivot?pivot[0]:q.x,y=pivot?pivot[1]:q.y,constant=new Vector3(pivot?q.x-x:0,pivot?q.y-y:0,q.z).applyMatrix4(matrix);
        const ax=m[0]*x+m[4]*y,az=m[2]*x+m[6]*y,bx=-m[0]*y+m[4]*x,bz=-m[2]*y+m[6]*x;
        for(const plane of planes)if(plane.nx*(constant.x-center[0])+plane.nz*(constant.z-center[1])+Math.hypot(plane.nx*ax+plane.nz*az,plane.nx*bx+plane.nz*bz)>plane.limit+1e-5)reject('动态部件旋转后超出领地边界');
        if(constant.y-Math.hypot(m[1]*x+m[5]*y,-m[1]*y+m[5]*x)<bounds.min[1]-.001)reject('动态部件旋转后低于建筑地基');
      }}for(const child of node.listChildren())check(child,cabin);
    }check(rotor,null);
  }
}
