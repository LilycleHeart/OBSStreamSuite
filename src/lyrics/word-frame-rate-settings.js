const { useState, useEffect } = React;
const options = [[0, '不限'], [30, '30 FPS'], [60, '60 FPS'], [120, '120 FPS']];
const key = kind => (kind === 'bar' ? 'lyric-bar-' : 'refined-now-playing-') + 'karaoke-framerate';
const eventName = kind => (kind === 'bar' ? 'lb-' : 'rnp-') + 'karaoke-framerate';
export const normalizeFrameRate = value => options.some(([fps]) => fps === Number(value)) ? Number(value) : 0;
export const readFrameRate = kind => normalizeFrameRate(localStorage.getItem(key(kind)));

export function useWordFrameRate(kind) {
    const [fps, setFps] = useState(() => readFrameRate(kind));
    useEffect(() => {
        const change = event => setFps(normalizeFrameRate(event.detail));
        const storage = event => { if (event.key === key(kind)) setFps(readFrameRate(kind)); };
        document.addEventListener(eventName(kind), change);
        window.addEventListener('storage', storage);
        installFrameRateSettings(kind);
        return () => { document.removeEventListener(eventName(kind), change); window.removeEventListener('storage', storage); };
    }, [kind]);
    return fps;
}

export function installFrameRateSettings(kind) {
    const guard = '__lyricFrameRateSettings_' + kind;
    if (window[guard]) return;
    window[guard] = true;
    if (!document.getElementById('lyric-frame-rate-setting-style')) {
        const style = document.createElement('style');
        style.id = 'lyric-frame-rate-setting-style';
        style.textContent = `[data-lyric-fps] {margin:12px 0 20px;}
            [data-lyric-fps] .rnp-select-group {display:flex;gap:2px;}
            [data-lyric-fps] button {cursor:pointer;color:inherit;min-width:0;padding:5px 3px;font-size:14px;}
            [data-lyric-fps] button.selected {background:var(--rnp-accent-color,#c54b50);color:var(--rnp-accent-color-on-primary,#fff);}
            [data-lyric-fps] .lyric-fps-note {font-size:12px;opacity:.7;line-height:1.5;margin-top:7px;}`;
        document.head.appendChild(style);
    }
    const sync = () => {
        const value = readFrameRate(kind);
        document.querySelectorAll(`[data-lyric-fps="${kind}"] button`).forEach(button => {
            const selected = Number(button.dataset.fps) === value;
            button.classList.toggle('selected', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
    };
    const makeControl = () => {
        const row = document.createElement('div');
        row.className = 'rnp-select-group-wrapper';
        row.dataset.lyricFps = kind;
        const label = document.createElement('div');
        label.className = 'rnp-select-group-label';label.textContent = '逐字动画帧率';
        const group = document.createElement('div');group.className = 'rnp-select-group';group.setAttribute('role','group');group.setAttribute('aria-label','逐字动画帧率');
        for (const [fps, text] of options) {
            const button = document.createElement('button');button.type='button';button.className='rnp-select-group-btn';button.dataset.fps=String(fps);button.textContent=text;
            button.addEventListener('click', () => {
                localStorage.setItem(key(kind), String(fps));
                document.dispatchEvent(new CustomEvent(eventName(kind), { detail: fps }));
            });
            group.appendChild(button);
        }
        const note=document.createElement('div');note.className='lyric-fps-note';
        note.textContent='不限：使用第一版原生动画。仅限制逐字动画；换行、拖音发光和长句横向滚动不受此项限制。';
        row.append(label,group,note);return row;
    };
    const scan = () => {
        if (kind === 'rnp') {
            for (const group of document.querySelectorAll('#karaoke-animation,#karaoke-animation-fm')) {
                const anchor=group.closest('.rnp-select-group-wrapper');
                if(anchor&&anchor.nextElementSibling?.dataset.lyricFps!=='rnp')anchor.after(makeControl());
            }
        } else {
            for(const container of document.querySelectorAll('.lyric-bar-settings')) {
                if(!container.querySelector('[data-lyric-fps="bar"]'))(container.firstElementChild||container).appendChild(makeControl());
            }
        }
        sync();
    };
    let queued=false;
    new MutationObserver(() => { if(!queued){queued=true;setTimeout(()=>{queued=false;scan()},0);} }).observe(document.body,{childList:true,subtree:true});
    document.addEventListener(eventName(kind), sync);
    window.addEventListener('storage', event => { if(event.key===key(kind))sync(); });
    scan();
}
