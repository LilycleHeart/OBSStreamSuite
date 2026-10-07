import { normalizeSong } from './metadata.js';
const prefix = 'obs-now-playing-';
const defaults = {enabled:true,progress:true,'hide-paused':true,rhythm:true,'cover-glow':true,'rhythm-framerate':20,'card-radius':10,'cover-radius':9};
export function initializeSongSettings(){for(const [key,value]of Object.entries(defaults)){const target='obs-stream-song-'+key;if(localStorage.getItem(target)===null)localStorage.setItem(target,localStorage.getItem(prefix+key)??String(value));}}
const readSetting=key=>{const value=localStorage.getItem('obs-stream-song-'+key)??localStorage.getItem(prefix+key);if(key==='card-radius'||key==='cover-radius'){const radius=value===null||value.trim()===''?defaults[key]:Number(value);return Number.isFinite(radius)?Math.max(0,Math.min(100,radius)):defaults[key];}if(key==='rhythm-framerate'){const fps=Number(value);return [10,15,20,30].includes(fps)?fps:20;}return value===null?defaults[key]:value!=='false';};
const setting=key=>key==='enabled'?readSetting(key)&&localStorage.getItem('obs-suite-enabled')!=='false':readSetting(key);
let refreshSettings = () => {};
const status = {text: '等待插件初始化'};
const panels = new Set();
const statusListeners=new Set();function updateStatus(text){if(status.text===text)return;status.text=text;for(const listener of statusListeners)listener(text);}

export async function startSongPublisher() {
    if (window.__obsStreamSongPublisher) return;
    await betterncm.utils.waitForElement('#main-player');
    const state = window.__obsStreamSongPublisher = {connected: false, viewers: 0};
    window.__obsNowPlaying ||= state;
    let socket = null, retry = null, lastReply = 0, lastSent = 0, lastMetaRead = 0, metadataTimer = null;
    let song = null, lastSnapshot = '', nativeDuration = 0;
    let clock = {seconds: 0, at: Date.now(), playing: false, id: '0'};
    const isPlaying = () => !!document.querySelector('.m-player:not(.f-dn) .btnp')?.classList.contains('btnp-pause');
    const getOptions = () => Object.fromEntries(Object.keys(defaults).map(key=>[key,setting(key)]));
    const send = data => { if(socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 1024*1024) socket.send(JSON.stringify(data)); };
    function theme() {
        const element = document.querySelector('#main-player') || document.body;
        const style = getComputedStyle(element);
        const dark = document.body.classList.contains('md-dark') || document.body.classList.contains('md-dynamic-theme-dark');
        const result = {dark, font: style.fontFamily, colors: {}};
        for (const name of ['--md-accent-color','--md-accent-color-rgb','--md-accent-color-secondary','--md-accent-color-secondary-rgb','--md-accent-color-bg','--md-accent-color-bg-rgb','--md-accent-color-bg-darken','--md-accent-color-grey-base-rgb']) result.colors[name] = style.getPropertyValue(name).trim();
        return result;
    }
    function readSong() {
        let playing;
        try {playing=betterncm.ncm.getPlayingSong?.() || betterncm.ncm.getPlaying?.();} catch {}
        const info=document.querySelector('.g-single-track .inf');
        const next=normalizeSong(playing, {
            title:document.querySelector('#main-player .j-title .name')?.textContent || info?.querySelector('.title .name')?.textContent,
            artist:document.querySelector('#main-player .j-title .by')?.textContent,
            cover:document.querySelector('#main-player .j-cover, .g-single-track img.front.j-cover')?.src
        });
        if(next && next.id !== song?.id) {nativeDuration=0;clock={seconds:0,at:Date.now(),playing:isPlaying(),id:next.id};}
        if(next && !next.duration) next.duration=nativeDuration;
        song=next;lastMetaRead=Date.now();
    }
    function snapshot(force = false) {
        if (!setting('enabled')) return;
        readSong();
        const packet={type:'snapshot',song,theme:theme(),options:getOptions()};
        const serialized=JSON.stringify(packet);
        if(force || serialized !== lastSnapshot) {lastSnapshot=serialized;send({...packet,progress:clock});}
    }
    function scheduleMetadata() {
        clearTimeout(metadataTimer);
        metadataTimer=setTimeout(()=>{snapshot();metadataTimer=null;},100);
    }
    function onProgress(id, seconds) {
        const now=Date.now();
        // Only one small metadata check per second while someone is watching.
        if(state.viewers && now-lastMetaRead>1000) snapshot();
        const wasPlaying=clock.playing;
        const expected=clock.seconds+(clock.playing?(now-clock.at)/1000:0);
        const seek=Math.abs(Number(seconds)-expected)>.75;
        clock={seconds:Math.max(0,Number(seconds)||0),at:now,playing:isPlaying(),id:song?.id||String(id)};
        if(state.viewers && (now-lastSent>=1000 || seek || wasPlaying!==clock.playing)){lastSent=now;send({type:'progress',progress:clock});}
    }
    function onState() {
        const now=Date.now();
        clock={...clock,seconds:clock.seconds+(clock.playing?(now-clock.at)/1000:0),at:now,playing:isPlaying()};
        if(state.viewers){snapshot();send({type:'progress',progress:clock});}
        setTimeout(()=>{if(clock.playing!==isPlaying())onState();},100);
    }
    function onLoad(id, info) {
        readSong();nativeDuration=Math.max(0,Number(info?.duration)||0);
        clock={seconds:0,at:Date.now(),playing:isPlaying(),id:song?.id||String(id)};
        snapshot(true);scheduleMetadata();
        setTimeout(()=>snapshot(),750);
    }
    function connect() {
        clearTimeout(retry);retry=null;
        if(!setting('enabled') || socket)return;
        if(window.__obsNowPlaying!==state && localStorage.getItem(prefix+'enabled')!=='false'){
            updateStatus('旧 OBSNowPlaying 输出已启用；请先在旧插件设置中关闭输出，无需卸载');retry=setTimeout(connect,2000);return;
        }
        socket=new WebSocket(__SONG_PUBLISH_URL__);
        socket.onopen=()=>{state.connected=true;lastReply=Date.now();updateStatus('已连接本机服务，等待 OBS 显示');snapshot(true);};
        socket.onmessage=event=>{
            let data;try{data=JSON.parse(event.data)}catch{return;}
            if(data.type!=='audience')return;lastReply=Date.now();
            const changed=data.viewers!==state.viewers;state.viewers=data.viewers;
            updateStatus(data.active?'OBS 正在显示歌曲信息':data.viewers?'浏览器预览已连接':'已连接本机服务，等待 OBS 显示');
            if(changed && data.viewers)snapshot(true);
        };
        socket.onerror=()=>{};
        socket.onclose=()=>{socket=null;state.connected=false;state.viewers=0;updateStatus(setting('enabled')?'等待本机连接服务':'已关闭 OBS 歌曲信息');if(setting('enabled'))retry=setTimeout(connect,5000);};
    }
    refreshSettings=()=>{if(setting('enabled')){connect();snapshot(true);}else{clearTimeout(retry);socket?.close();updateStatus('已关闭 OBS 歌曲信息');}};
    for(const [name,callback]of [['Load',onLoad],['PlayState',onState],['PlayProgress',onProgress]])legacyNativeCmder.appendRegisterCall(name,'audioplayer',callback);
    const themeObserver=new MutationObserver(()=>{if(state.viewers)scheduleMetadata();});
    themeObserver.observe(document.body,{attributes:true,attributeFilter:['class','style']});
    themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class','style']});
    setInterval(()=>{
        if(socket?.readyState===WebSocket.OPEN)send({type:'heartbeat'});
        if(lastReply && Date.now()-lastReply>6000)socket?.close();
        if(state.viewers)snapshot();
    },2000);
    readSong();clock.playing=isPlaying();connect();
}

export const getSongSetting=readSetting;export function refreshSongSettings(){refreshSettings();}export function getSongStatus(){return status.text;}export function subscribeSongStatus(listener){statusListeners.add(listener);return()=>statusListeners.delete(listener);}
