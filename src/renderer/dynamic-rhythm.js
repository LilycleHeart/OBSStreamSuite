// A playback-state-driven visual effect; no audio capture or FFT is performed.
// All 21 columns are drawn as one SVG path, with a bounded 20 FPS timer.
export function createRhythmAnimator(path) {
    if (!path) return {setRunning(){},destroy(){}};
    const bands=Array.from({length:21},(_,index)=>({
        x:5+index*10,
        phase:index*1.873,
        speed:5.3+(index%7)*.61,
        envelope:.62+.38*Math.sin((index+1)/22*Math.PI)
    }));
    const stats=path.__obsRhythm={running:false,frames:0,fpsLimit:20};
    let timer=null,anchor=0,elapsed=0,dead=false,last='';
    function draw() {
        const seconds=(elapsed+performance.now()-anchor)/1000;
        const data=bands.map(band=>{
            const first=(Math.sin(seconds*band.speed+band.phase)+1)/2;
            const second=(Math.sin(seconds*(band.speed*.49)+band.phase*1.31)+1)/2;
            const height=4+18*band.envelope*(first*.68+second*.32);
            return 'M'+band.x+' '+((28-height)/2).toFixed(1)+'v'+height.toFixed(1);
        }).join(' ');
        if(data!==last){path.setAttribute('d',data);last=data;}
        stats.frames++;
    }
    function setRunning(running) {
        if(dead || !!running===stats.running)return;
        stats.running=!!running;
        if(running){anchor=performance.now();draw();timer=setInterval(draw,1000/stats.fpsLimit);}
        else {elapsed+=performance.now()-anchor;clearInterval(timer);timer=null;}
    }
    function destroy(){setRunning(false);dead=true;}
    function setFps(value){const fps=Number(value);if(![10,15,20,30].includes(fps)||fps===stats.fpsLimit)return;stats.fpsLimit=fps;if(timer!==null){clearInterval(timer);timer=setInterval(draw,1000/fps);}}
    return {setRunning,setFps,destroy};
}
