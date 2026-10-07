const { useRef, useMemo, useLayoutEffect } = React;
const clamp = value => Math.max(0, Math.min(1, value));
const wordStyle = { transition: 'none', willChange: 'auto', opacity: 1, transform: 'none' };
const CJK = /[\p{Unified_Ideograph}\u3040-\u30ff]/u;

function installStyles() {
    if (document.getElementById('netease-karaoke-framerate')) return;
    const style = document.createElement('style');
    style.id = 'netease-karaoke-framerate';
    style.textContent = `
        .rnp-fps-karaoke .rnp-karaoke-word {
            transition: none !important;
            will-change: auto !important;
            position: relative;
        }
        .rnp-fps-karaoke .rnp-karaoke-word-filler { transition: none !important; will-change: auto !important; }
    `;
    document.head.appendChild(style);
}

// CSS ease: cubic-bezier(.25, .1, .25, 1), sampled on the bounded word clock.
function ease(progress) {
    const x = clamp(progress);
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 18; i++) {
        t = (lo + hi) / 2;
        const value = 3 * (1 - t) * (1 - t) * t * .25 + 3 * (1 - t) * t * t * .25 + t * t * t;
        if (value < x) lo = t; else hi = t;
    }
    return 3 * (1 - t) * (1 - t) * t * .1 + 3 * (1 - t) * t * t + t * t * t;
}

function LimitedKaraokeLine({ line, active, passed, currentTime, playState, seekCounter, elementRef, fps = 30, animation = 'float', bar = false }) {
    const ref = useRef(null);
    const words = useMemo(() => line.dynamicLyric.map(word => ({
        ...word,
        time: Number(word.time) || 0,
        duration: Math.max(0, Number(word.duration) || 0)
    })), [line.dynamicLyric]);
    const bindRef = React.useCallback(element => { ref.current = element; if (elementRef) elementRef.current = element; }, [elementRef]);

    useLayoutEffect(() => {
        installStyles();
        const root = ref.current;
        if (!root) return;
        const elements = Array.from(root.children);
        const styles = words.map(() => ({ opacity: null, transform: null, mask: null, fillerOpacity: null }));
        const activeWords = new Set();
        const events = [];
        const stats = { fpsLimit: fps, frames: 0, wordUpdates: 0, activeWords: 0 };
        root.__rnpWordStats = stats;
        const interval = 1000 / stats.fpsLimit;
        let timer = null, frame = null, stopped = false, cursor = 0;
        const anchor = performance.now();
        let deadline = anchor;
        const mediaTime = Number(currentTime) || 0;
        const playing = !!playState;

        function update(index, time) {
            const word = words[index], element = elements[index];
            if (!element) return;
            const elapsed = time - word.time;
            const opacityValue = word.duration > 0 ? .4 + .6 * clamp(elapsed / word.duration) : elapsed < 0 ? .4 : 1;
            const slide = animation === 'slide';
            const moveDuration = slide ? word.duration * .8 : word.duration + 150;
            const moveElapsed = slide ? elapsed - word.duration * .5 : elapsed;
            const distance = slide ? 1 : 2;
            const lift = moveDuration <= 0 ? (moveElapsed >= 0 ? distance : 0) : moveElapsed <= 0 ? 0 : moveElapsed >= moveDuration ? distance : distance * ease(moveElapsed / moveDuration);
            const opacity = animation === 'slide' ? '1' : active ? String(Math.round(opacityValue * 10000) / 10000) : '1';
            const transform = active && lift > 0 ? `translateY(-${Math.round(lift * 1000) / 1000}px)` : 'none';
            if (styles[index].opacity !== opacity) { element.style.opacity = opacity; styles[index].opacity = opacity; }
            if (styles[index].transform !== transform) { element.style.transform = transform; styles[index].transform = transform; }
            if (animation === 'slide') {
                const filler = element.children[1];
                if (filler) {
                    const progress = word.duration > 0 ? clamp(elapsed / word.duration) : elapsed < 0 ? 0 : 1;
                    const mask = (100 - (active ? progress : passed ? 1 : 0) * 100).toFixed(3) + '%';
                    const fillerOpacity = active ? '1' : '0';
                    if (styles[index].mask !== mask) { filler.style.webkitMaskPositionX = mask; styles[index].mask = mask; }
                    if (styles[index].fillerOpacity !== fillerOpacity) { filler.style.opacity = fillerOpacity; styles[index].fillerOpacity = fillerOpacity; }
                }
            }
            stats.wordUpdates++;
        }

        for (let index = 0; index < words.length; index++) {
            const word = words[index], end = word.time + (animation === 'slide' ? word.duration * 1.3 : word.duration + 150);
            update(index, mediaTime);
            if (active && playing) {
                events.push({ time: word.time, index, start: true }, { time: end, index, start: false });
                if (mediaTime >= word.time && mediaTime < end) activeWords.add(index);
            }
        }
        events.sort((a, b) => a.time - b.time);
        while (cursor < events.length && events[cursor].time <= mediaTime) cursor++;
        stats.activeWords = activeWords.size;

        function schedule(at) {
            timer = setTimeout(() => {
                timer = null;
                frame = requestAnimationFrame(tick);
            }, Math.max(1, at - performance.now() - 1));
        }
        function tick() {
            frame = null;
            if (stopped) return;
            const timestamp = performance.now();
            const time = mediaTime + timestamp - anchor;
            const changed = new Set(activeWords);
            while (cursor < events.length && events[cursor].time <= time) {
                const event = events[cursor++];
                if (event.start) activeWords.add(event.index); else activeWords.delete(event.index);
                changed.add(event.index);
            }
            for (const index of changed) update(index, time);
            stats.frames++;
            stats.activeWords = activeWords.size;
            if (activeWords.size) {
                deadline = Math.max(deadline + interval, timestamp + 1);
                schedule(deadline);
            } else if (cursor < events.length) {
                deadline = anchor + events[cursor].time - mediaTime;
                schedule(deadline);
            }
        }
        if (active && playing) {
            if (activeWords.size) { deadline = anchor + interval; schedule(deadline); }
            else if (cursor < events.length) { deadline = anchor + events[cursor].time - mediaTime; schedule(deadline); }
        }
        return () => {
            stopped = true;
            if (timer !== null) clearTimeout(timer);
            if (frame !== null) cancelAnimationFrame(frame);
            if (root.__rnpWordStats === stats) delete root.__rnpWordStats;
        };
    }, [words, active, passed, currentTime, playState, seekCounter, fps, animation]);


    return <div className="rnp-lyrics-line-karaoke rnp-fps-karaoke" ref={bindRef} style={{ opacity: animation === 'slide' ? 1 : active ? 1 : .4 }}>
        {words.map((word, index) => <span key={index}
            className={`rnp-karaoke-word ${bar ? 'lyricbar-karaoke-word' : ''} ${(word.isCJK ?? CJK.test(word.word)) ? 'is-cjk' : ''} ${(word.endsWithSpace ?? word.word.endsWith(' ')) ? 'end-with-space' : ''}`}
            style={wordStyle}>
            <span>{word.word}</span>
            {animation === 'slide' && <span className="rnp-karaoke-word-filler">{word.word}</span>}
        </span>)}
    </div>;
}

export const KaraokeLine = React.memo(LimitedKaraokeLine, (previous, next) => {
    if (previous.line !== next.line || previous.active !== next.active || previous.passed !== next.passed ||
        previous.elementRef !== next.elementRef || previous.bar !== next.bar || previous.fps !== next.fps || previous.animation !== next.animation) return false;
    // Inactive ordinary text has no clock, effects, or animation hints.
    if (!next.active) return true;
    return previous.currentTime === next.currentTime && previous.playState === next.playState && previous.seekCounter === next.seekCounter;
});
