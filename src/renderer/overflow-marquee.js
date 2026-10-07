// Layout is measured only when content, fonts or the available space changes.
// The browser runs the transform animation; no per-frame JavaScript is needed.
export function createOverflowMarquee(elements){
    const rows=elements.filter(Boolean).map(element=>{
        let content=element.querySelector('.marquee-text');
        if(!content){content=document.createElement('span');content.className='marquee-text';content.textContent=element.textContent;element.replaceChildren(content);}
        return{element,content,signature:'',animation:null};
    });
    let running=false,frame=null,dead=false;
    function reset(row){row.animation?.cancel();row.animation=null;row.element.classList.remove('is-overflowing');}
    function measure(){
        frame=null;if(dead)return;
        for(const row of rows){
            const width=row.element.clientWidth;if(width<=0){reset(row);row.signature='';continue;}
            const natural=row.content.scrollWidth,signature=row.content.textContent+'|'+width+'|'+natural;
            if(signature===row.signature)continue;
            row.signature=signature;reset(row);
            const overflow=natural-width;if(overflow<=1)continue;
            row.element.classList.add('is-overflowing');
            const distance=Math.ceil(overflow)+2,travel=Math.max(.9,distance/28),start=1.4,end=1.1,rest=.8,total=start+travel*2+end+rest;
            row.animation=row.content.animate([
                {transform:'translateX(0)',offset:0},
                {transform:'translateX(0)',offset:start/total},
                {transform:'translateX(-'+distance+'px)',offset:(start+travel)/total},
                {transform:'translateX(-'+distance+'px)',offset:(start+travel+end)/total},
                {transform:'translateX(0)',offset:(start+travel*2+end)/total},
                {transform:'translateX(0)',offset:1}
            ],{duration:total*1000,iterations:Infinity,easing:'linear'});
            if(!running){row.animation.pause();row.animation.currentTime=0;}
        }
    }
    function refresh(){if(!dead&&frame===null)frame=requestAnimationFrame(measure);}
    function setRunning(value){
        value=!!value;if(running===value)return;running=value;
        for(const row of rows){if(!row.animation)continue;if(running)row.animation.play();else row.animation.pause();}
        if(running)refresh();
    }
    const resize=new ResizeObserver(refresh);for(const row of rows)resize.observe(row.element);
    document.fonts?.ready.then(refresh);document.fonts?.addEventListener('loadingdone',refresh);
    refresh();
    return{refresh,setRunning,destroy(){dead=true;resize.disconnect();document.fonts?.removeEventListener('loadingdone',refresh);if(frame!==null)cancelAnimationFrame(frame);for(const row of rows)reset(row);}};
}
