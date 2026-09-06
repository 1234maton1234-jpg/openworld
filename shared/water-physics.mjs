export class WaterField{
  constructor(size=65,span=96){this.size=size;this.span=span;this.cell=span/(size-1);this.height=new Float32Array(size*size);this.velocity=new Float32Array(size*size);this.depth=new Float32Array(size*size);this.next=new Float32Array(size*size);}
  reset(depthAt){const n=this.size;this.height.fill(0);this.velocity.fill(0);for(let z=0;z<n;z++)for(let x=0;x<n;x++)this.depth[z*n+x]=Math.max(0,depthAt(x*this.cell-this.span/2,z*this.cell-this.span/2));}
  disturb(x,z,strength=1){const n=this.size,cx=(x+this.span/2)/this.cell,cz=(z+this.span/2)/this.cell,ix=Math.round(cx),iz=Math.round(cz);if(ix<1||iz<1||ix>=n-1||iz>=n-1||this.depth[iz*n+ix]<.03)return false;
    for(let j=Math.max(1,iz-5);j<Math.min(n-1,iz+6);j++)for(let i=Math.max(1,ix-5);i<Math.min(n-1,ix+6);i++){const k=j*n+i,r=((i-cx)**2+(j-cz)**2)/3;if(this.depth[k]>.03)this.velocity[k]+=strength*(1-r)*Math.exp(-r);}
    return true;
  }
  step(seconds){const dt=Math.min(Math.max(seconds,0),1/60),n=this.size,h=this.height,v=this.velocity,d=this.depth,inv=1/(this.cell*this.cell);
    for(let z=0;z<n;z++)for(let x=0;x<n;x++){const k=z*n+x;if(d[k]<.03){this.next[k]=0;v[k]=0;continue;}let sum=0;for(const j of [x>0?k-1:k,x<n-1?k+1:k,z>0?k-n:k,z<n-1?k+n:k])sum+=d[j]>.03?h[j]:h[k];v[k]=(v[k]+9.81*Math.min(d[k],1.5)*(sum-4*h[k])*inv*dt)*Math.exp(-.75*dt);this.next[k]=Math.max(-.6,Math.min(.6,h[k]+v[k]*dt));}
    this.height.set(this.next);
  }
  sample(x,z){const gx=(x+this.span/2)/this.cell,gz=(z+this.span/2)/this.cell,n=this.size;if(gx<1||gz<1||gx>=n-2||gz>=n-2)return {height:0,slopeX:0,slopeZ:0};const ix=Math.floor(gx),iz=Math.floor(gz),fx=gx-ix,fz=gz-iz,k=iz*n+ix,h=this.height;return {height:(h[k]*(1-fx)+h[k+1]*fx)*(1-fz)+(h[k+n]*(1-fx)+h[k+n+1]*fx)*fz,slopeX:(h[k+1]-h[k-1])/(2*this.cell),slopeZ:(h[k+n]-h[k-n])/(2*this.cell)};}
  energy(){let sum=0;for(let i=0;i<this.height.length;i++)sum+=this.height[i]**2+this.velocity[i]**2;return sum;}
}
