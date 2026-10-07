// A single outgoing/incoming transition per content change. Repeated snapshots
// refresh the pending value; rapid changes invalidate previous asynchronous work.
export function createContentTransition({element,apply,visible,prepare=async()=>null,duration=180}) {
    let key=null,pending=null,generation=0,timer=null,frame=null;
    function clear(){clearTimeout(timer);timer=null;if(frame!==null)cancelAnimationFrame(frame);frame=null;}
    function reveal(version){frame=requestAnimationFrame(()=>{frame=requestAnimationFrame(()=>{frame=null;if(version===generation)element.classList.remove('track-switching');});});}
    function commit(version,prepared){
        if(version!==generation||!pending)return;
        const next=pending;pending=null;key=next.key;apply(next.value,prepared);reveal(version);
    }
    function swap(nextKey,value){
        if(pending?.key===nextKey){pending.value=value;return;}
        const version=++generation;clear();
        if(key===null||nextKey===key||!visible()){
            key=nextKey;pending=null;element.classList.remove('track-switching');apply(value,null);return;
        }
        pending={key:nextKey,value};
        Promise.resolve(prepare(value)).catch(()=>null).then(prepared=>{
            if(version!==generation)return;
            if(!visible()){commit(version,prepared);element.classList.remove('track-switching');return;}
            element.classList.add('track-switching');
            timer=setTimeout(()=>{timer=null;commit(version,prepared);},duration);
        });
    }
    function flush(){
        const version=++generation;clear();element.classList.remove('track-switching');
        if(pending){const next=pending;pending=null;key=next.key;apply(next.value,null);}
    }
    function dispose(){generation++;clear();pending=null;element.classList.remove('track-switching');}
    return{swap,flush,dispose,updatePending(update){if(pending)pending.value=update(pending.value);},get pending(){return !!pending;}};
}
