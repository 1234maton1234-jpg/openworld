export class DepthGrid{
  constructor(size,span,sample){this.size=size;this.span=span;this.sample=sample;this.current=null;this.pending=null;}
  request(x,z,revision){
    const previous=this.pending||this.current;if(previous&&previous.x===x&&previous.z===z&&previous.revision===revision)return;
    const n=this.size,cell=this.span/(n-1),old=this.current,dx=old?(x-old.x)/cell:Infinity,dz=old?(z-old.z)/cell:Infinity;
    const reuse=old&&old.revision===revision&&Number.isInteger(dx)&&Number.isInteger(dz),values=new Float32Array(n*n),ranges=[];
    for(let row=0;row<n;row++){
      const source=row+dz,lo=reuse?Math.max(0,-dx):0,hi=reuse?Math.min(n,n-dx):0;
      if(reuse&&source>=0&&source<n&&hi>lo){values.set(old.values.subarray(source*n+lo+dx,source*n+hi+dx),row*n+lo);if(lo)ranges.push([row*n,row*n+lo]);if(hi<n)ranges.push([row*n+hi,(row+1)*n]);}
      else ranges.push([row*n,(row+1)*n]);
    }
    this.pending={x,z,revision,values,ranges,range:0};
  }
  step(budget=3,clock=()=>performance.now()){
    const job=this.pending;if(!job)return false;const start=clock(),n=this.size,cell=this.span/(n-1);let count=0;
    while(job.range<job.ranges.length){const range=job.ranges[job.range];while(range[0]<range[1]){const i=range[0]++;job.values[i]=this.sample(job.x+(i%n)*cell-this.span/2,job.z+Math.floor(i/n)*cell-this.span/2);if(++count%64===0&&clock()-start>=budget)return false;}job.range++;}
    this.current=job;this.pending=null;return true;
  }
}
