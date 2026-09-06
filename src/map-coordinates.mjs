export const mapPoint=(x,z,view,w,h)=>[(x-view.x)*view.scale+w/2,(z-view.z)*view.scale+h/2];
export function zoomMap(view,factor,px,py,w,h){const scale=Math.max(.035,Math.min(2,view.scale*factor));return {x:view.x+(px-w/2)*(1/view.scale-1/scale),z:view.z+(py-h/2)*(1/view.scale-1/scale),scale};}
