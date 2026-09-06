export function walkFacing(current,dx,dz,dt){
  if(Math.hypot(dx,dz)<1e-6)return current;
  const target=Math.atan2(-dx,-dz),difference=Math.atan2(Math.sin(target-current),Math.cos(target-current));
  return current+difference*(1-Math.exp(-18*dt));
}
