// Measure the final layout independently of the animated panel, so wrapping does
// not chase its width on every animation frame. Work only when content changes.
export function installLyricMorph() {
    const panel=document.getElementById('bar-root');
    const content=panel?.querySelector('.lyric-bar-inner');
    if(!panel || !content || panel.__obsMorph)return;
    const stats=panel.__obsMorph={updates:0,width:0,height:0};
    let initialized=false;
    const measure=()=>{
        const width=Math.ceil(content.offsetWidth),height=Math.ceil(content.offsetHeight);
        if(width<=0 || height<=0 || (width===stats.width && height===stats.height))return;
        stats.width=width;stats.height=height;stats.updates++;
        panel.style.setProperty('--obs-measured-width',width+'px');
        panel.style.setProperty('--obs-measured-height',height+'px');
        if(!initialized){
            // First appearance uses its real dimensions; later changes morph.
            void panel.offsetWidth;
            panel.classList.add('obs-morph-ready');
            initialized=true;
        }
    };
    const observer=new ResizeObserver(measure);
    observer.observe(content);
    document.fonts?.ready.then(measure);
    window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
    measure();
}
