import {lyricKeys as SETTINGS,readLyricSetting} from './lyric-settings.js';
export function installObsBridge() {
    if (window.__lyricBarObsViewer || window.__lyricBarObs) return;
    const state = window.__lyricBarObs = {connected: false, active: false, viewers: 0, status: '等待本机连接服务'};
    const enabled=()=>localStorage.getItem('lyric-bar-obs-enabled')!=='false'&&localStorage.getItem('obs-suite-enabled')!=='false';
    let socket = null, retry = null, lastReply = 0;
    let clock = {seconds: 0, at: Date.now(), playing: false, id: '0', seek: 0};
    let lyrics = window.currentLyrics || {lyrics: []};
    let globalOffset = null;
    const playing = () => !!document.querySelector('.m-player:not(.f-dn) .btnp')?.classList.contains('btnp-pause');
    function setActive(value) {
        state.active = !!value && enabled();
        document.body.classList.toggle('lyricbar-obs-active', state.active);
        state.status = !enabled() ? '已关闭 OBS 词栏' : state.active ? 'OBS 正在显示'+(document.querySelector('.lyric-bar')?' · 原 LyricBar 已自动隐藏':'') : state.connected ? '等待 OBS 显示此浏览器源' : '等待本机连接服务';
        document.querySelectorAll('[data-lyricbar-obs-status]').forEach(el => { if(el.textContent !== state.status) el.textContent = state.status; });
    }
    const send = data => { if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 2 * 1024 * 1024) socket.send(JSON.stringify(data)); };
    function settings() {
        const result = {};
        for (const key of SETTINGS) result[key] = readLyricSetting(key);
        if (globalOffset !== null && localStorage.getItem('obs-lyrics-lyric-offset')===null) result['lyric-offset'] = String(globalOffset);
        const style = getComputedStyle(document.querySelector('.lyric-bar') || document.body);
        result.colors = {};
        for (const key of ['--ncm-bg-rgb', '--ncm-fg-rgb', '--ncm-text', '--md-accent-color-bg-rgb', '--md-accent-color-rgb', '--md-accent-color']) result.colors[key] = style.getPropertyValue(key).trim();
        result.fontFamily = style.fontFamily;
        return result;
    }
    function snapshot() {
        if (!enabled()) return;
        send({type: 'snapshot', lyrics: {lyrics: lyrics.lyrics || [], unsynced: !!lyrics.unsynced}, settings: settings(), progress: clock});
    }
    function progress(id, seconds) {
        const now = Date.now();
        const expected = clock.seconds + (clock.playing ? (now - clock.at) / 1000 : 0);
        const didSeek = id !== clock.id || Math.abs(Number(seconds) - expected) > 0.6;
        clock = {seconds: Number(seconds) || 0, at: now, playing: playing(), id, seek: clock.seek + Number(didSeek)};
        if (state.viewers) {
            send({type: 'progress', progress: clock});
        }
    }
    function playState(id) {
        const now = Date.now();
        clock = {...clock, seconds: id === clock.id ? clock.seconds : 0, at: now, id, playing: playing()};
        if (state.viewers) send({type: 'progress', progress: clock});
        // Native button classes may settle just after the callback.
        setTimeout(() => { if (clock.playing !== playing()) playState(clock.id); }, 80);
    }
    function connect() {
        clearTimeout(retry); retry = null;
        if (!enabled() || socket) return;
        try { socket = new WebSocket(__OBS_PUBLISH_URL__); } catch { retry = setTimeout(connect, 5000); return; }
        socket.onopen = () => { state.connected = true; lastReply = Date.now(); setActive(false); snapshot(); };
        socket.onmessage = event => {
            let data; try { data = JSON.parse(event.data); } catch { return; }
            if (data.type !== 'audience') return;
            lastReply = Date.now();
            const changed = data.viewers !== state.viewers;
            state.viewers = data.viewers;
            setActive(data.active);
            if (changed && data.viewers) snapshot();
        };
        socket.onerror = () => {};
        socket.onclose = () => { socket = null; state.connected = false; state.viewers = 0; setActive(false); if (enabled()) retry = setTimeout(connect, 5000); };
    }
    function refreshEnabled() {
        if (enabled()) connect();
        else { clearTimeout(retry); retry = null; socket?.close(); }
        setActive(false);
    }
    const style = document.createElement('style');
    style.dataset.obsStreamVisibility='';
    style.textContent = 'body.lyricbar-obs-active .lyric-bar{display:none!important}';
    document.head.appendChild(style);
    legacyNativeCmder.appendRegisterCall('PlayProgress', 'audioplayer', progress);
    legacyNativeCmder.appendRegisterCall('PlayState', 'audioplayer', playState);
    document.addEventListener('lyrics-updated', event => { lyrics = event.detail || {lyrics: []}; if(state.viewers) snapshot(); });
    for (const key of SETTINGS) document.addEventListener('obs-lyrics-' + key, () => { if(state.viewers) snapshot(); });
    document.addEventListener('rnp-global-offset', event => {
        globalOffset = Number(event.detail) || 0;
        if (state.viewers) { snapshot(); send({type:'progress', progress: clock}); }
    });
    window.addEventListener('storage', event => { if(event.key === 'lyric-bar-obs-enabled') refreshEnabled(); else if(event.key?.startsWith('obs-lyrics-') && state.viewers) snapshot(); });
    setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) send({type: 'heartbeat'});
        if (lastReply && Date.now() - lastReply > 6000) { setActive(false); socket?.close(); }
    }, 2000);
    state.refreshEnabled=refreshEnabled;connect();
}
