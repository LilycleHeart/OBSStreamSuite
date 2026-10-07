// Shared by both lyric renderers. Compatible with CloudMusic's Chromium 91.
const { useState, useRef, useEffect } = React;

export function useLyricVisibility(kind, isFM = false) {
    const read = () => {
        if (document.hidden && !(window.__lyricBarObsViewer && window.obsstudio)) return false;
        const body = document.body;
        const fm = (body.getAttribute('page-hash') || '').includes('/m/fm/');
        if (kind === 'bar') return !body.classList.contains('lyricbar-obs-active') && !body.classList.contains('mq-playing') && !body.classList.contains('mq-mv') && !fm;
        return isFM ? fm : body.classList.contains('mq-playing');
    };
    const [visible, setVisible] = useState(read);
    const latest = useRef(visible);
    latest.current = visible;
    useEffect(() => {
        const update = () => {
            const next = read();
            latest.current = next;
            setVisible(next);
        };
        const observer = new MutationObserver(update);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'page-hash'] });
        document.addEventListener('visibilitychange', update);
        update();
        return () => {
            observer.disconnect();
            document.removeEventListener('visibilitychange', update);
        };
    }, [kind, isFM]);
    return [visible, latest];
}

export function findLyricIndex(lines, time) {
    let lo = 0, hi = lines.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (lines[mid].time <= time) lo = mid + 1;
        else hi = mid;
    }
    return Math.max(0, lo - 1);
}

function subscribeSeek(listener) {
    const key = '__neteaseLyricPerformanceSeekV1';
    let state = window[key];
    if (!state) {
        const original = channel.call;
        state = { listeners: new Set(), original, wrapper: null };
        state.wrapper = function(name, ...args) {
            if (name === 'audioplayer.seek') {
                for (const callback of state.listeners) callback(args[1]?.[2]);
            }
            return original.apply(this, [name, ...args]);
        };
        window[key] = state;
        channel.call = state.wrapper;
    }
    state.listeners.add(listener);
    return () => {
        state.listeners.delete(listener);
        if (!state.listeners.size && channel.call === state.wrapper) {
            channel.call = state.original;
            delete window[key];
        }
    };
}

export function usePlaybackSubscription(onState, onProgress, onSeek) {
    const callbacks = useRef({ onState, onProgress, onSeek });
    callbacks.current = { onState, onProgress, onSeek };
    useEffect(() => {
        const state = (...args) => callbacks.current.onState(...args);
        const progress = (...args) => callbacks.current.onProgress(...args);
        const seek = (seconds) => callbacks.current.onSeek(seconds);
        legacyNativeCmder.appendRegisterCall('PlayState', 'audioplayer', state);
        legacyNativeCmder.appendRegisterCall('PlayProgress', 'audioplayer', progress);
        const unsubscribeSeek = subscribeSeek(seek);
        return () => {
            legacyNativeCmder.removeRegisterCall('PlayState', 'audioplayer', state);
            legacyNativeCmder.removeRegisterCall('PlayProgress', 'audioplayer', progress);
            unsubscribeSeek();
        };
    }, []);
}
