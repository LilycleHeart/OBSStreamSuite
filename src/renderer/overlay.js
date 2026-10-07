import { Lyrics } from '../lyrics/lyrics.js';
import { applySharedTheme } from '../lyrics/shared-theme.js';
import { installLyricMorph } from '../lyrics/lyric-morph.js';
window.__lyricBarObsViewer = true;
installLyricMorph();
const listeners = {PlayProgress: new Set(), PlayState: new Set()};
window.legacyNativeCmder = {
    appendRegisterCall(name, scope, callback) { listeners[name]?.add(callback); },
    removeRegisterCall(name, scope, callback) { listeners[name]?.delete(callback); }
};
window.channel = {call() {}};
const emit = (type, ...args) => { for(const callback of listeners[type] || []) callback(...args); };
let socket, online = false, ready = false, obsVisible = true;
let progress = {seconds: 0, at: Date.now(), playing: false, id: '0', seek: 0};
let previousId = null, previousPlaying = null, previousSeek = null, mounted = false, lastMessage = 0;
const isVisible = () => obsVisible && (!!window.obsstudio || !document.hidden);
function presence() {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({type:'presence', obs: !!window.obsstudio, visible: isVisible(), ready: ready && online}));
}
function visibility() {
    document.body.classList.toggle('mq-playing', !online || !isVisible());
    document.getElementById('bar-root').classList.toggle('obs-paused', !progress.playing);
    presence();
    if(online && isVisible()) tick(true);
}
window.addEventListener('obsSourceVisibleChanged', event => { obsVisible = !!event.detail.visible; visibility(); });
if (window.obsstudio) window.obsstudio.onVisibilityChange = visible => { obsVisible = !!visible; visibility(); };
document.addEventListener('visibilitychange', visibility);
function currentSeconds() { return progress.seconds; }
function tick(force = false) {
    document.getElementById('bar-root').classList.toggle('obs-paused', !progress.playing);
    if(!mounted || !online || !isVisible()) return;
    const button = document.querySelector('#main-player .btnp');
    button.classList.toggle('btnp-pause', progress.playing);
    if (force || progress.id !== previousId || progress.playing !== previousPlaying) {
        emit('PlayState', progress.id, progress.playing ? 'resume' : 'pause');
        previousId = progress.id; previousPlaying = progress.playing;
    }
    if (previousSeek !== progress.seek) {
        window.channel.call('audioplayer.seek', () => {}, [progress.id, 'obs', currentSeconds()]);
        previousSeek = progress.seek;
    }
    emit('PlayProgress', progress.id, currentSeconds());
}
function applySettings(settings) {
    for(const [key, value] of Object.entries(settings)) {
        if (['colors','fontFamily'].includes(key)) continue;
        const old = localStorage.getItem('lyric-bar-' + key);
        if(value === null) localStorage.removeItem('lyric-bar-' + key); else localStorage.setItem('lyric-bar-' + key, String(value));
        if (old !== value) document.dispatchEvent(new CustomEvent('lb-' + key, {detail: value === 'true' ? true : value === 'false' ? false : value}));
        if(key === 'lyric-offset' && old !== value) document.dispatchEvent(new CustomEvent('rnp-global-offset', {detail: Number(value) || 0}));
    }
    const bar = document.getElementById('bar-root');
    bar.classList.remove('text-align-left', 'text-align-center', 'text-align-right');
    bar.classList.add('text-align-' + (['left','center','right'].includes(settings['text-align']) ? settings['text-align'] : 'left'));
    bar.style.opacity = Math.max(0, Math.min(1, Number(settings.opacity ?? 100) / 100));
    bar.style.setProperty('--lyric-bar-width', settings['lyric-bar-width'] || '400px');
    const width=Math.max(0,Math.min(2000,Number(settings['obs-max-width'])||0));
    const duration=Math.max(100,Math.min(2000,Number(settings['obs-morph-duration'])||500));
    bar.style.setProperty('--obs-custom-cap',width?width+'px':'100000px');
    bar.style.setProperty('--obs-morph-duration',duration+'ms');
    document.body.style.fontFamily = 'inherit';
}
function offline() {
    online = false; ready = false; previousId = null;
    visibility();
}
function connect() {
    socket = new WebSocket('ws://' + location.host + '/view');
    socket.onopen = presence;
    socket.onerror = () => {};
    socket.onclose = () => { offline(); setTimeout(connect, 2500); };
    socket.onmessage = event => {
        let data; try {data = JSON.parse(event.data);} catch {return;}
        lastMessage = Date.now();
        if(data.type === 'theme') { applySharedTheme(data.theme); return; }
        if(data.type === 'offline') return offline();
        if(data.type === 'snapshot') {
            applySettings(data.settings);
            applySharedTheme(data.theme || {colors:data.settings.colors,font:data.settings.fontFamily});
            progress = data.progress;
            const next = data.lyrics;
            // Repeated settings/sync snapshots must not restart every word animation.
            const serialized = JSON.stringify(next);
            const changed = window.__lyricsSerialized !== serialized;
            window.__lyricsSerialized = serialized;
            if(changed) { window.currentLyrics = next; if(mounted) document.dispatchEvent(new CustomEvent('lyrics-updated', {detail: next})); }
            online = true;
            if(!mounted) { ReactDOM.render(React.createElement(Lyrics, {}), document.getElementById('bar-inner')); mounted = true; }
            visibility();
            requestAnimationFrame(() => requestAnimationFrame(() => { if(online) { tick(true); ready = true; presence(); } }));
        } else if(data.type === 'progress') { progress = data.progress; tick(); }
    };
}
setInterval(presence, 1500);
window.addEventListener('pagehide', () => { ready = false; presence(); socket?.close(); });
window.addEventListener('error', () => { ready = false; presence(); });
connect();
