// Keep the host's persistent rows and vertical transitions. Measure each row's
// final wrapped geometry separately, never while its outer panel is animating.
export function installLyricMorph() {
    const panel=document.getElementById('bar-root');
    const content=panel?.querySelector('.lyric-bar-inner');
    if(!panel || !content || panel.__obsMorph)return;
    const stats=panel.__obsMorph={updates:0,measurements:0,width:0,height:0};
    const heights=new Map();
    window.__obsLyricGeometry={transform(index,focus,containerHeight,transit,interlude){
        const currentHeight=heights.get(focus)||containerHeight;
        let top=containerHeight/2-currentHeight/2;
        if(index<focus)for(let i=focus-1;i>=index;i--)top-=(heights.get(i)||currentHeight)+5;
        if(index>focus){for(let i=focus;i<index;i++)top+=(heights.get(i)||currentHeight)+5;if(interlude)top+=50;}
        return {top,delay:0,duration:transit?500:0};
    }};
    const cache=new WeakMap(),mirror=document.createElement('div');
    mirror.className='obs-lyric-measure';mirror.setAttribute('aria-hidden','true');panel.appendChild(mirror);
    let initialized=false,queued=false,frame=null,dead=false;
    function measure(){
        if(dead)return;
        const root=content.querySelector('.rnp-lyrics');if(!root)return;
        const cap=parseFloat(getComputedStyle(mirror).maxWidth)||innerWidth;
        const font=getComputedStyle(root).fontSize+'|'+getComputedStyle(root).fontFamily;
        const active=root.querySelector('.rnp-lyrics-line[offset="0"]');
        let geometryChanged=false;
        for(const row of root.children){
            if(!row.classList.contains('rnp-lyrics-line'))continue;
            const types=[...row.querySelectorAll('.rnp-lyrics-single-line-wrapper>div')].map(el=>el.className.replace(/force-refresh/g,'')).join('|');
            const signature=cap+'|'+font+'|'+root.className+'|'+types+'|'+row.textContent;
            let geometry=cache.get(row);
            if(!geometry || geometry.signature!==signature){
                const shell=root.cloneNode(false),clone=row.cloneNode(true);clone.setAttribute('offset','0');shell.appendChild(clone);mirror.replaceChildren(shell);
                geometry={signature,width:Math.min(cap,Math.ceil(clone.offsetWidth+2)),height:Math.ceil(clone.offsetHeight)};cache.set(row,geometry);stats.measurements++;
            }
            row.style.setProperty('--obs-line-width',geometry.width+'px');row.style.setProperty('--obs-line-height',geometry.height+'px');
            const index=Number(row.dataset.lyricIndex);
            if(Number.isInteger(index)&&heights.get(index)!==geometry.height){heights.set(index,geometry.height);geometryChanged=true;}
        }
        mirror.replaceChildren();
        if(geometryChanged)window.dispatchEvent(new Event('recalc-lyrics'));
        const geometry=active&&cache.get(active);if(!geometry||geometry.width<=0||geometry.height<=0)return;
        const {width,height}=geometry;if(width===stats.width&&height===stats.height)return;
        stats.width=width;stats.height=height;stats.updates++;
        panel.style.setProperty('--obs-measured-width',width+'px');panel.style.setProperty('--obs-measured-height',height+'px');
        if(!initialized){void panel.offsetWidth;panel.classList.add('obs-morph-ready');initialized=true;}
    }
    function schedule(){if(queued||dead)return;queued=true;frame=requestAnimationFrame(()=>{queued=false;frame=null;measure();});}
    const mutations=new MutationObserver(schedule);mutations.observe(content,{childList:true,subtree:true,attributes:true,attributeFilter:['offset','class']});
    const rootChanges=new MutationObserver(schedule);rootChanges.observe(panel,{attributes:true,attributeFilter:['style','class']});rootChanges.observe(document.documentElement,{attributes:true,attributeFilter:['style','class']});
    const resize=new ResizeObserver(schedule);resize.observe(document.documentElement);
    document.addEventListener('lb-lyric-font-size',schedule);document.addEventListener('lb-first-line-bold',schedule);
    document.fonts?.ready.then(schedule);
    window.addEventListener('pagehide',()=>{dead=true;mutations.disconnect();rootChanges.disconnect();resize.disconnect();if(frame!==null)cancelAnimationFrame(frame);},{once:true});
    schedule();
}
