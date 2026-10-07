// Loopback-only relay. No playback control, capture, or external network traffic.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer, WebSocket } = require('ws');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'bridge-config.json'), 'utf8'));
const origin = `http://127.0.0.1:${config.port}`;
const clients = new Set();
const channels = {lyrics: {publisher: null, snapshot: null}, song: {publisher: null, snapshot: null}};
let sharedTheme = null, lastTheme = '';
function synchronizeTheme() {
    const songTheme = channels.song.snapshot?.theme;
    const lyricSettings = channels.lyrics.snapshot?.settings;
    const next = channels.song.publisher && songTheme?.colors?.['--md-accent-color'] ? {...songTheme, source: 'material-you'} : sharedTheme?.source==='material-you' ? sharedTheme : lyricSettings ? {colors:lyricSettings.colors||{},font:lyricSettings.fontFamily,dark:true,source:'lyric-fallback'} : null;
    const signature = JSON.stringify(next);
    if(next && signature!==lastTheme){
        sharedTheme=next;lastTheme=signature;
        for(const channel of Object.keys(channels))broadcast(channel,{type:'theme',theme:sharedTheme});
    }
}
function withTheme(data) { return data?.type==='snapshot' ? {...data,theme:sharedTheme||data.theme} : data; }
const send = (socket, data) => {
    if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 4 * 1024 * 1024)
        socket.send(JSON.stringify(data));
};
function audience(channel = 'lyrics') {
    const now = Date.now();
    const viewers = [...clients].filter(c => c.channel === channel && c.role === 'viewer' && c.visible && now - c.seen < 5000);
    return {type: 'audience', viewers: viewers.length, active: !!channels[channel].publisher && viewers.some(c => c.obs && c.ready)};
}
function broadcast(channel, data) {
    for (const client of clients) if (client.channel === channel && client.role === 'viewer') send(client, data);
}
function notify() {
    for (const [channel, state] of Object.entries(channels)) {
        const value=audience(channel);
        // The song publisher also keeps the palette fresh when only the lyric source is visible.
        if(channel==='song')value.viewers+=audience('lyrics').viewers;
        send(state.publisher,value);
    }
}
const assets = new Map([
    ['/', ['overlay.html', 'text/html; charset=utf-8']],
    ['/overlay', ['overlay.html', 'text/html; charset=utf-8']],
    ['/overlay.js', ['overlay.js', 'text/javascript; charset=utf-8']],
    ['/overlay.css', ['overlay.css', 'text/css; charset=utf-8']],
    ['/react.js', ['react.js', 'text/javascript; charset=utf-8']],
    ['/react-dom.js', ['react-dom.js', 'text/javascript; charset=utf-8']],
    ['/nowplaying', ['nowplaying.html', 'text/html; charset=utf-8']],
    ['/nowplaying.js', ['nowplaying.js', 'text/javascript; charset=utf-8']],
    ['/nowplaying.css', ['nowplaying.css', 'text/css; charset=utf-8']]
]);
const server = http.createServer((req, res) => {
    if (req.headers.host !== `127.0.0.1:${config.port}`) { res.writeHead(403); return res.end(); }
    const pathname = new URL(req.url, origin).pathname;
    if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (pathname === '/health') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.end(JSON.stringify({service: 'lyricbar-obs', version: 3, publisher: !!channels.lyrics.publisher, ...audience(), song: {publisher: !!channels.song.publisher, ...audience('song')}, themeSource:sharedTheme?.source||null}));
    }
    const asset = assets.get(pathname);
    if (!asset) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', asset[1]);
    fs.createReadStream(path.join(__dirname, 'public', asset[0])).on('error', () => res.destroy()).pipe(res);
});
const sockets = new WebSocketServer({noServer: true, maxPayload: 2 * 1024 * 1024, perMessageDeflate: false});
server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, origin);
    const channel = ['/song-publish', '/song-view'].includes(url.pathname) ? 'song' : 'lyrics';
    const state = channels[channel];
    const token = channel === 'song' ? config.songToken : config.token;
    const publishing = url.pathname === (channel === 'song' ? '/song-publish' : '/publish') && !!token && url.searchParams.get('token') === token;
    const viewing = url.pathname === (channel === 'song' ? '/song-view' : '/view') && req.headers.origin === origin;
    if (req.headers.host !== `127.0.0.1:${config.port}` || (!publishing && !viewing)) return socket.destroy();
    sockets.handleUpgrade(req, socket, head, ws => {
        ws.role = publishing ? 'publisher' : 'viewer';
        ws.channel = channel;
        ws.seen = Date.now(); ws.visible = false; ws.ready = false; ws.obs = false;
        clients.add(ws);
        if (publishing) {
            if (state.publisher) state.publisher.close(1000, 'New publisher');
            state.publisher = ws; state.snapshot = null;
            broadcast(channel, {type: 'offline'});
        } else if (state.snapshot) send(ws, withTheme(state.snapshot));
        else send(ws, {type: 'offline'});
        if(!publishing && sharedTheme)send(ws,{type:'theme',theme:sharedTheme});
        notify();
        ws.on('message', raw => {
            let data; try { data = JSON.parse(raw.toString()); } catch { return ws.close(1003); }
            if (!data || typeof data !== 'object' || Array.isArray(data)) return ws.close(1003);
            ws.seen = Date.now();
            if (ws === state.publisher) {
                if (data.type === 'snapshot' && (channel === 'lyrics' ? Array.isArray(data.lyrics?.lyrics) : data.song === null || typeof data.song?.title === 'string')) {
                    state.snapshot = data;synchronizeTheme();broadcast(channel, withTheme(data));
                } else if (data.type === 'progress' && state.snapshot && Number.isFinite(data.progress?.seconds)) {
                    state.snapshot.progress = data.progress; broadcast(channel, data);
                }
            } else if (ws.role === 'viewer' && data.type === 'presence') {
                const changed = ws.visible !== !!data.visible || ws.ready !== !!data.ready || ws.obs !== !!data.obs;
                ws.visible = !!data.visible; ws.ready = !!data.ready; ws.obs = !!data.obs;
                if (changed) notify();
            }
        });
        ws.on('error', () => {});
        ws.on('close', () => {
            clients.delete(ws);
            if (ws === state.publisher) { state.publisher = null; state.snapshot = null; broadcast(channel, {type: 'offline'});synchronizeTheme(); }
            notify();
        });
    });
});
setInterval(() => {
    for (const socket of clients) if (Date.now() - socket.seen > 7000) socket.terminate();
    notify();
}, 1000).unref();
server.listen(config.port, '127.0.0.1', () => console.log(`LyricBar OBS ready on ${origin}/overlay`));
server.on('error', error => { console.error(error.code || error.message); process.exitCode = 1; });
