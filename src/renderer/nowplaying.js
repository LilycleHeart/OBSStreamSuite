import { applySharedTheme } from '../lyrics/shared-theme.js';
import { createRhythmAnimator } from './dynamic-rhythm.js';
const $=id=>document.getElementById(id);
const rhythm=createRhythmAnimator(document.querySelector('.rhythm path'));
let socket, online=false, song=null, options={}, progress={seconds:0,at:Date.now(),playing:false};
let visible=true, lastArt='', generation=0, timer=null;
let fadeTimer=null, fadeGeneration=0;
const text=(id,value)=>{const element=$(id);if(element&&element.textContent!==value)element.textContent=value;};
function sourceVisible(){return visible && (!!window.obsstudio || !document.hidden);}
function show(){return online && !!song?.title && sourceVisible() && !(options['hide-paused']!==false && !progress.playing);}
function presence(){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'presence',obs:!!window.obsstudio,visible:sourceVisible(),ready:show()}));}
function time(seconds){seconds=Math.max(0,Math.floor(seconds));return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
function tick(){
    if(!show())return;
    const duration=Number(song.duration)||0;
    const position=Math.max(0,Math.min(duration||Infinity,progress.seconds+(progress.playing?Math.max(0,Date.now()-progress.at)/1000:0)));
    text('elapsed',time(position));text('duration',time(duration));
    const transform='scaleX('+(duration>0?Math.min(1,position/duration).toFixed(5):0)+')';
    if($('fill').style.transform!==transform)$('fill').style.transform=transform;
    const percentage=(duration>0?Math.min(100,position/duration*100):0).toFixed(3)+'%';
    if($('track').style.getPropertyValue('--progress')!==percentage)$('track').style.setProperty('--progress',percentage);
}
function update(){
    const card=$('card'), wanted=show(), fade=++fadeGeneration;
    for(const [key,fallback]of [['card-radius',10],['cover-radius',9]]){
        const radius=options[key]===null||options[key]===undefined?fallback:Number(options[key]);
        card.style.setProperty('--obs-'+key,(Number.isFinite(radius)?Math.max(0,Math.min(100,radius)):fallback)+'px');
    }
    clearTimeout(fadeTimer);
    if(wanted){
        const wasHidden=card.hidden;card.hidden=false;
        if(wasHidden)requestAnimationFrame(()=>requestAnimationFrame(()=>{if(fade===fadeGeneration && show())card.classList.add('is-visible');}));
        else card.classList.add('is-visible');
    }else{
        card.classList.remove('is-visible');
        fadeTimer=setTimeout(()=>{if(!show())card.hidden=true;},240);
    }
    if($('status')){
        $('status').hidden=options.status===false;
        $('status').parentElement.hidden=options.status===false;
        text('status-text',progress.playing?'正在播放':'已暂停');
        $('status-icon').setAttribute('d',progress.playing?'M4 2v12l10-6z':'M3 2h4v12H3zm6 0h4v12H9z');
    }
    $('timeline').hidden=options.progress===false || !song?.duration;
    $('track').hidden=$('timeline').hidden;
    card.classList.toggle('cover-glow-off',options['cover-glow']===false);
    rhythm.setFps?.(options['rhythm-framerate']||20);
    rhythm.setRunning(show() && progress.playing && !$('timeline').hidden && options.rhythm!==false);
    if($('album'))$('album').parentElement.hidden=options.album===false || !song?.album;
    card.setAttribute('aria-label',(song?.title||'')+' · '+(progress.playing?'正在播放':'已暂停'));
    clearInterval(timer);timer=null;
    // Progress alone updates four times a second; no rAF loop or continuous CSS animation.
    if(show() && progress.playing && options.progress!==false && song.duration>0)timer=setInterval(tick,250);
    tick();presence();
}
function artwork(url){
    if(lastArt===url)return;lastArt=url;const current=++generation;
    $('card').classList.remove('has-art');
    $('cover').hidden=true;$('cover').removeAttribute('src');$('placeholder').hidden=false;
    if(!url)return;
    let parsed;try{parsed=new URL(url);}catch{return;}
    if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)return;
    const image=new Image();image.referrerPolicy='no-referrer';
    image.onload=()=>{if(current!==generation)return;$('cover').src=url;$('cover').hidden=false;$('placeholder').hidden=true;$('card').classList.add('has-art');};
    image.onerror=()=>{if(current===generation){$('cover').hidden=true;$('placeholder').hidden=false;$('card').classList.remove('has-art');}};
    image.src=url;
}
function connect(){
    socket=new WebSocket('ws://'+location.host+'/song-view');
    socket.onopen=presence;socket.onerror=()=>{};
    socket.onclose=()=>{online=false;update();setTimeout(connect,2500);};
    socket.onmessage=event=>{
        let data;try{data=JSON.parse(event.data)}catch{return;}
        if(data.type==='theme'){applySharedTheme(data.theme);return;}
        if(data.type==='offline'){online=false;return update();}
        if(data.type==='snapshot'){
            online=true;song=data.song;options=data.options||{};progress=data.progress||{seconds:0,at:Date.now(),playing:false};
            applySharedTheme(data.theme);text('title',song?.title||'');text('artist',song?.artist||'');text('album',song?.album||'');
            artwork(song?.cover||'');update();
        }else if(data.type==='progress'){
            const changed=progress.playing!==data.progress.playing;progress=data.progress;
            if(changed)update();else tick();
        }
    };
}
window.addEventListener('obsSourceVisibleChanged',event=>{visible=!!event.detail.visible;update();});
if(window.obsstudio)window.obsstudio.onVisibilityChange=value=>{visible=!!value;update();};
document.addEventListener('visibilitychange',update);
window.addEventListener('pagehide',()=>{online=false;rhythm.destroy();presence();socket?.close();});
setInterval(presence,1500);connect();
