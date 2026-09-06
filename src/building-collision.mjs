import {Vector3} from 'three';

const CELL=4,STEP=.8;
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function distance(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
function clip(poly,y,above){const result=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],inside=above?a.y>=y:a.y<=y,next=above?b.y>=y:b.y<=y;if(inside)result.push(a);if(inside!==next){const t=(y-a.y)/(b.y-a.y);result.push({x:a.x+(b.x-a.x)*t,y,z:a.z+(b.z-a.z)*t});}}return result;}

export function createBuildingCollision(object){
  object.updateWorldMatrix(true,true);
  const offset=object.position.clone(),bins=new Map();
  object.traverse(mesh=>{
    if(!mesh.isMesh)return;const g=mesh.geometry,pos=g.attributes.position,index=g.index,count=index?.count??pos.count;
    for(let i=0;i<count;i+=3){const triangle=[];for(let j=0;j<3;j++)triangle.push(new Vector3().fromBufferAttribute(pos,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld).sub(offset));
      const xs=triangle.map(p=>p.x),zs=triangle.map(p=>p.z);
      for(let x=Math.floor(Math.min(...xs)/CELL);x<=Math.floor(Math.max(...xs)/CELL);x++)for(let z=Math.floor(Math.min(...zs)/CELL);z<=Math.floor(Math.max(...zs)/CELL);z++){const key=x+','+z;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(triangle);}
    }
  });
  function candidates(x,z,r=0){const result=new Set();for(let bx=Math.floor((x-r)/CELL);bx<=Math.floor((x+r)/CELL);bx++)for(let bz=Math.floor((z-r)/CELL);bz<=Math.floor((z+r)/CELL);bz++)for(const t of bins.get(bx+','+bz)||[])result.add(t);return result;}
  return {
    surface(x,z,maxHeight=Infinity){
      x-=object.position.x;z-=object.position.z;const limit=maxHeight-object.position.y,p={x,z};let height=-Infinity;
      for(const [a,b,c] of candidates(x,z)){const den=cross(a,b,c);if(Math.abs(den)<1e-8)continue;
        const u=cross(a,p,c)/den,v=cross(a,b,p)/den;if(u<-.00001||v<-.00001||u+v>1.00001)continue;
        const normal=new Vector3().subVectors(b,a).cross(new Vector3().subVectors(c,a)).normalize();if(normal.y<.65)continue;
        const y=a.y+u*(b.y-a.y)+v*(c.y-a.y);if(y<=limit+.001)height=Math.max(height,y);
      }
      return height+object.position.y;
    },
    blocked(x,z,feet,radius=.35){
      x-=object.position.x;z-=object.position.z;feet-=object.position.y;const p={x,z};
      for(const triangle of candidates(x,z,radius)){
        const poly=clip(clip(triangle,feet+STEP+.01,true),feet+1.85,false);if(!poly.length)continue;
        if(poly.some((a,i)=>distance(p,a,poly[(i+1)%poly.length])<radius))return true;
        const turns=poly.map((a,i)=>cross(a,poly[(i+1)%poly.length],p));if(turns.some(v=>Math.abs(v)>1e-8)&&(turns.every(v=>v>=0)||turns.every(v=>v<=0)))return true;
      }
      return false;
    }
  };
}
