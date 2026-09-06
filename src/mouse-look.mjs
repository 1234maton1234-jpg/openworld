export function createMouseLook(apply){
  let previous=null,firstLocked=true;
  function delta(dx,dy){if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)>500||Math.abs(dy)>500)return;apply(dx,dy);}
  return {
    reset(){previous=null;firstLocked=true;},
    locked(dx,dy){previous=null;if(firstLocked){firstLocked=false;return;}delta(dx,dy);},
    absolute(x,y){if(!Number.isFinite(x)||!Number.isFinite(y)){previous=null;return;}if(previous)delta(x-previous.x,y-previous.y);previous={x,y};}
  };
}
