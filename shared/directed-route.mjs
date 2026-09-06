export function directedRoute(start,end,point,neighbors){
  const heap=[],cost=new Map(),states=new Map(),target=point(end);
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
  function push(item){let i=heap.length;heap.push(item);while(i){const p=(i-1)>>1;if(heap[p].score<=item.score)break;heap[i]=heap[p];i=p;}heap[i]=item;}
  function pop(){const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].score<heap[child].score)child++;if(heap[child].score>=last.score)break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;}
  const initial={id:start,key:start+'|none',direction:null,cost:0};states.set(initial.key,initial);cost.set(initial.key,0);push({...initial,score:distance(point(start),target)});
  while(heap.length){
    const current=pop();if(current.cost!==cost.get(current.key))continue;
    if(current.id===end){const path=[];let state=states.get(current.key);while(state.previous){const previous=states.get(state.previous);path.push({a:point(previous.id),b:point(state.id),span:state.span});state=previous;}return path.reverse();}
    const from=point(current.id);
    for(const edge of neighbors(current.id)){
      const to=point(edge.id),length=distance(from,to),direction=length>.01?[(to[0]-from[0])/length,(to[2]-from[2])/length]:current.direction;
      const dot=current.direction&&direction?current.direction[0]*direction[0]+current.direction[1]*direction[1]:1;if(dot<-.01)continue;
      const key=edge.id+'|'+(direction?direction.map(v=>Math.round(v*10000)).join(','):'none'),next=current.cost+length+(edge.penalty||0)+(1-dot)*24;
      if(next>=(cost.get(key)??Infinity))continue;
      const state={id:edge.id,key,direction,cost:next,previous:current.key,span:edge.span};cost.set(key,next);states.set(key,state);push({...state,score:next+distance(to,target)});
    }
  }
  return null;
}
