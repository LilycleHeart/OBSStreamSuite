// The only host-side animation change is useLyricVisibility's OBS ownership flag.
const SETTINGS = ['lyric-font-size', 'show-translation', 'show-romaji', 'use-karaoke-lyrics', 'first-line-bold', 'adaptive-width', 'text-align', 'opacity', 'lyric-offset', 'karaoke-framerate', 'lyric-bar-width', 'obs-max-width', 'obs-morph-duration'];
export function installObsBridge() {
    if (window.__lyricBarObsViewer || window.__lyricBarObs) return;
    const state = window.__lyricBarObs = {connected: false, active: false, viewers: 0, status: '等待本机连接服务'};
    const enabled=()=>localStorage.getItem('lyric-bar-obs-enabled')!=='false'&&localStorage.getItem('obs-suite-enabled')!=='false';
    let socket = null, retry = null, lastReply = 0, lastSent = 0, lastPlaying = null;
    let clock = {seconds: 0, at: Date.now(), playing: false, id: '0', seek: 0};
    let lyrics = window.currentLyrics || {lyrics: []};
    let globalOffset = null;
    const playing = () => !!document.querySelector('.m-player:not(.f-dn) .btnp')?.classList.contains('btnp-pause');
    function setActive(value) {
        state.active = !!value && enabled();
        document.body.classList.toggle('lyricbar-obs-active', state.active);
        state.status = !enabled() ? '已关闭 OBS 词栏' : state.active ? 'OBS 正在显示 · 软件内词栏已暂停渲染' : state.connected ? '等待 OBS 显示此浏览器源' : '等待本机连接服务';
        document.querySelectorAll('[data-lyricbar-obs-status]').forEach(el => { if(el.textContent !== state.status) el.textContent = state.status; });
    }
    const send = data => { if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 2 * 1024 * 1024) socket.send(JSON.stringify(data)); };
    function settings() {
        const result = {};
        for (const key of SETTINGS) result[key] = localStorage.getItem('lyric-bar-' + key);
        if (globalOffset !== null) result['lyric-offset'] = String(globalOffset);
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
        if (state.viewers && (didSeek || now - lastSent >= 200 || lastPlaying !== clock.playing)) {
            lastSent = now; lastPlaying = clock.playing; send({type: 'progress', progress: clock});
        }
    }
    function playState(id) {
        const now = Date.now();
        clock = {...clock, seconds: id === clock.id ? clock.seconds + (clock.playing ? (now - clock.at) / 1000 : 0) : 0, at: now, id, playing: playing()};
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
    style.textContent = 'body.lyricbar-obs-active .lyric-bar{display:none!important} [data-lyricbar-obs]{margin:18px 0;line-height:1.7} [data-lyricbar-obs] input[type=text]{width:100%;box-sizing:border-box;color:inherit;background:transparent;border:1px solid #8886;padding:5px} [data-lyricbar-obs] small{display:block;opacity:.7}';
    document.head.appendChild(style);
    let scheduled = false;
    function scan() {
        for (const container of document.querySelectorAll('.lyric-bar-settings')) {
            if (container.querySelector('[data-lyricbar-obs]')) continue;
            const row = document.createElement('div'); row.dataset.lyricbarObs = '';
            const label = document.createElement('label'), checkbox = document.createElement('input');
            checkbox.type = 'checkbox'; checkbox.checked = enabled();
            checkbox.addEventListener('change', () => { localStorage.setItem('lyric-bar-obs-enabled', String(checkbox.checked)); refreshEnabled(); });
            label.append(checkbox, ' 在 OBS 显示小词栏');
            const address = document.createElement('input'); address.type = 'text'; address.readOnly = true; address.value = __OBS_OVERLAY_URL__; address.setAttribute('aria-label', 'OBS 浏览器源地址');
            address.addEventListener('click', () => address.select());
            const status = document.createElement('small'); status.dataset.lyricbarObsStatus = ''; status.textContent = state.status;
            const help = document.createElement('small'); help.textContent = '把地址填入 OBS 浏览器源；可见时自动隐藏软件内词栏，隐藏或断线后恢复。OBS 源建议 1000 × 160，并启用“不显示时关闭源”。普通浏览器预览不触发隐藏。';
            row.append(label, address, status, help); (container.firstElementChild || container).appendChild(row);
        }
    }
    new MutationObserver(() => { if(!scheduled){scheduled=true;setTimeout(()=>{scheduled=false;scan()},100);} }).observe(document.body, {childList: true, subtree: true});
    legacyNativeCmder.appendRegisterCall('PlayProgress', 'audioplayer', progress);
    legacyNativeCmder.appendRegisterCall('PlayState', 'audioplayer', playState);
    document.addEventListener('lyrics-updated', event => { lyrics = event.detail || {lyrics: []}; if(state.viewers) snapshot(); });
    for (const key of SETTINGS) document.addEventListener('lb-' + key, () => { if(state.viewers) snapshot(); });
    document.addEventListener('rnp-global-offset', event => {
        globalOffset = Number(event.detail) || 0;
        if (state.viewers) { snapshot(); send({type:'progress', progress: clock}); }
    });
    window.addEventListener('storage', event => { if(event.key === 'lyric-bar-obs-enabled') refreshEnabled(); else if(event.key?.startsWith('lyric-bar-') && state.viewers) snapshot(); });
    setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) send({type: 'heartbeat'});
        if (lastReply && Date.now() - lastReply > 6000) { setActive(false); socket?.close(); }
    }, 2000);
    state.refreshEnabled=refreshEnabled;scan();connect();
}
