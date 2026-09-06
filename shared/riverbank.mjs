const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function riverbankHeight(distance,level){
  if(distance<=30)return -1.5+2.7*smooth((distance-14)/16);
  if(distance<=38)return 1.2;
  const width=Math.min(150,Math.max(48,(level-1.2)*4));
  return 1.2+(level-1.2)*smooth((distance-38)/width);
}
