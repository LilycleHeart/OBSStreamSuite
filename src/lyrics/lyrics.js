import { installObsBridge } from './native-bridge.js';
import { useWordFrameRate } from './word-frame-rate-settings.js';
import { KaraokeLine as LimitedKaraokeLine } from './frame-rate-karaoke.js';
import { useLyricVisibility, usePlaybackSubscription, findLyricIndex } from './lyric-performance.js';
import { getSetting, setSetting } from './utils.js';

const useState = React.useState;
const useEffect = React.useEffect;
const useRef = React.useRef;


export function Lyrics(props) {
	useEffect(() => { installObsBridge(); }, []);
	const wordFps = useWordFrameRate('bar');
	const [visible, visibleRef] = useLyricVisibility('bar', props.isFM ?? false);
	const containerRef = useRef(null);

	let [lyrics, setLyrics] = useState(null);
	const _lyrics = useRef(null);
	const _setLyrics = setLyrics;
	setLyrics = (x) => {
		_lyrics.current = x;
		_setLyrics(x);
	}
	const [hasTranslation, setHasTranslation] = useState(false);
	const [hasRomaji, setHasRomaji] = useState(false);
	const [hasKaraoke, setHasKaraoke] = useState(false);
	const [isUnsynced, setIsUnsynced] = useState(false);

	const [playState, setPlayState] = useState(null);
	const _playState = useRef(null);
	const [songId, setSongId] = useState("0");
	const currentTime = useRef(0); // 当前播放时间
	const [seekCounter, setSeekCounter] = useState(0); // 拖动进度条时修改触发重渲染
	const [recalcCounter, setRecalcCounter] = useState(0); // 手动重计算时触发渲染

	let [currentLine, setCurrentLine] = useState(0);
	const _currentLine = useRef(0);
	const _setCurrentLine = setCurrentLine;
	setCurrentLine = (x) => {
		_currentLine.current = x;
		_setCurrentLine(x);
	}
	const [currentLineForScrolling, setCurrentLineForScrolling] = useState(0);	// 为提前 0.2s 滚动，使滚动 delay 与逐词歌词对应 而设置的 提前的，仅用于滚动的 currentLine

	const [globalOffset, setGlobalOffset] = useState(parseInt(getSetting('lyric-offset', 0)));

	const heightOfItems = useRef([]);

	const [containerHeight, setContainerHeight] = useState(0);
	const [containerWidth, setContainerWidth] = useState(0);

	const [fontSize, setFontSize] = useState(parseInt(getSetting('lyric-font-size', 20)));
	const [showTranslation, setShowTranslation] = useState(!!getSetting('show-translation', true));
	const [showRomaji, setShowRomaji] = useState(!!getSetting('show-romaji', false));
	const [useKaraokeLyrics, setUseKaraokeLyrics] = useState(!!getSetting('use-karaoke-lyrics', true));
	const [firstLineBold, setFirstLineBold] = useState(!!getSetting('first-line-bold', false));
	const [adaptiveWidth, setAdaptiveWidth] = useState(!!getSetting('adaptive-width', true));



	const shouldTransit = useRef(true);

	const isPureMusic = !lyrics || (
		lyrics.length <= 1 ||
		lyrics.length <= 10 && lyrics.some((x) => (x.originalLyric ?? '').includes('纯音乐')) ||
		document.querySelector('#main-player').getAttribute('data-log')?.includes('"s_ctype":"voice"') ||
		isUnsynced
	);

	useEffect(() => {
		if (isPureMusic) {
			containerRef.current.parentElement.parentElement.classList.add('no-lyrics');
		} else {
			containerRef.current.parentElement.parentElement.classList.remove('no-lyrics');
		}
	}, [lyrics, songId]);



	const onLyricsUpdate = (e) => {
		if (!e.detail) {
			return;
		}
		shouldTransit.current = false;
		if (!e.detail.amend){
			setCurrentLine(0);
			setCurrentLineForScrolling(0);
		}
		setLyrics(e.detail.lyrics);
		setHasTranslation(e.detail.lyrics.some((x) => x.translatedLyric));
		setHasRomaji(e.detail.lyrics.some((x) => x.romanLyric));
		setHasKaraoke(e.detail.lyrics.some((x) => x.dynamicLyric));
		setIsUnsynced(e.detail?.unsynced ?? false);
		if (e.detail.amend) {
			shouldTransit.current = true;
			setRecalcCounter(+ new Date());
		}
	}

	useEffect(() => {
		shouldTransit.current = false;
		if (window.currentLyrics) {
			const currentLyrics = window.currentLyrics.lyrics;
			setLyrics(currentLyrics);
			setHasTranslation(currentLyrics.some((x) => x.translatedLyric));
			setHasRomaji(currentLyrics.some((x) => x.romanLyric));
			setHasKaraoke(currentLyrics.some((x) => x.dynamicLyric));
			setIsUnsynced(currentLyrics?.unsynced ?? false);
		}
		document.addEventListener('lyrics-updated', onLyricsUpdate);
		return () => {
			document.removeEventListener('lyrics-updated', onLyricsUpdate);
		}
	}, []);

	useEffect(() => {
		document.body.style.setProperty('--lyric-bar-font-size', fontSize + 'px');
		document.body.style.setProperty('--lyric-bar-lines', ((hasTranslation && showTranslation) + (hasRomaji && showRomaji) + 1));
	}, [hasTranslation, hasRomaji, showTranslation, showRomaji, fontSize]);

	const onResize = () => {
		if (!window.__lyricBarObsViewer) shouldTransit.current = false;
		const container = containerRef.current;
		if (!container) return;
		setContainerHeight(container.clientHeight);
		if (!adaptiveWidth) setContainerWidth(container.clientWidth - 30);
		//console.log('resize', container.clientWidth, container.clientHeight);
	};

	useEffect(() => {
		const resizeObserver = new ResizeObserver(() => {
			onResize();
		});
		resizeObserver.observe(containerRef.current);
		onResize();
		//window.addEventListener("resize", onResize);
		return () => {
			//window.removeEventListener("resize", onResize);
			resizeObserver.disconnect();
		}
	}, [adaptiveWidth]);

	useEffect(() => {
		const onRecalc = () => {
			setRecalcCounter(+ new Date());
		}
		window.addEventListener('recalc-lyrics', onRecalc);
		return () => {
			window.removeEventListener('recalc-lyrics', onRecalc);
		}
	}, []);

	const focusLine = Math.min(Math.max(currentLineForScrolling, 0), Math.max((lyrics?.length ?? 1) - 1, 0));
	const windowStart = Math.max(0, focusLine - 2);
	const windowEnd = Math.min(lyrics?.length ?? 0, focusLine + 3);
	const getLineTransform = (index) => window.__lyricBarObsViewer && window.__obsLyricGeometry ? window.__obsLyricGeometry.transform(index,focusLine,containerHeight,shouldTransit.current,lyrics[focusLine]?.isInterlude) : ({
		top: (index - focusLine) * (containerHeight + 5) + (index > focusLine && lyrics[focusLine]?.isInterlude ? 50 : 0),
		delay: 0,
		duration: shouldTransit.current ? 500 : 0
	});

	const onPlayStateChange = (id, state) => {
		_playState.current = document.querySelector(".m-player:not(.f-dn) .btnp").classList.contains("btnp-pause");
		setPlayState(_playState.current);
		//setPlayState((state.split("|")[1] == "resume"));
		if (document.querySelector(".m-player-fm .btnp").classList.contains("btnp-pause")) {
			setCurrentLineForScrolling(currentLine);
		}
		//console.log(id);
		setSongId(id);
	};
	const onPlayProgress = (id, progress) => {
		//console.log("new progress", id, progress);
		//setSongId(id);
		const lastTime = currentTime.current + globalOffset;
		currentTime.current = ((progress * 1000) || 0);
		const currentTimeWithOffset = currentTime.current + globalOffset;
		if (!_lyrics.current?.length || !visibleRef.current) return;
		if (currentTimeWithOffset < lastTime - 10) setSeekCounter(x => x + 1);
		let cur = findLyricIndex(_lyrics.current, currentTimeWithOffset);
		const scrollingDelay = 0;
		const curForScrolling = scrollingDelay ? findLyricIndex(_lyrics.current, currentTimeWithOffset + scrollingDelay) : cur;
		if (cur === _lyrics.current.length - 1 && _lyrics.current[cur].duration &&
			currentTimeWithOffset > _lyrics.current[cur].time + _lyrics.current[cur].duration + 500) cur++;

		shouldTransit.current = true;
		setCurrentLine(cur);
		setCurrentLineForScrolling(curForScrolling);
	};
	useEffect(() => {
		onPlayProgress(songId, currentTime.current / 1000);
		if (visible) setSeekCounter(x => x + 1);
	}, [lyrics, globalOffset, visible]);


	usePlaybackSubscription(onPlayStateChange, onPlayProgress, (seconds) => {
		currentTime.current = Math.trunc(Number(seconds) * 1000) || 0;
		if (visibleRef.current) setSeekCounter(x => x + 1);
	});

	useEffect(() => {
		const onLyricFontSizeChange = (e) => {
			setFontSize(e.detail ?? 20);
		}
		const onShowTranslationChange = (e) => {
			setShowTranslation(e.detail ?? true);
		}
		const onShowRomajiChange = (e) => {
			setShowRomaji(e.detail ?? false);
		}
		const onUseKaraokeLyricsChange = (e) => {
			setUseKaraokeLyrics(e.detail ?? true);
		}
		const onFirstLineBoldChange = (e) => {
			setFirstLineBold(e.detail ?? false);
		}
		const onAdaptiveWidthChange = (e) => {
			setAdaptiveWidth(e.detail ?? true);
		}
		document.addEventListener("lb-lyric-font-size", onLyricFontSizeChange);
		document.addEventListener("lb-show-translation", onShowTranslationChange);
		document.addEventListener("lb-show-romaji", onShowRomajiChange);
		document.addEventListener("lb-use-karaoke-lyrics", onUseKaraokeLyricsChange);
		document.addEventListener("lb-first-line-bold", onFirstLineBoldChange);
		document.addEventListener("lb-adaptive-width", onAdaptiveWidthChange);
		return () => {
			document.removeEventListener("lb-lyric-font-size", onLyricFontSizeChange);
			document.removeEventListener("lb-show-translation", onShowTranslationChange);
			document.removeEventListener("lb-show-romaji", onShowRomajiChange);
			document.removeEventListener("lb-use-karaoke-lyrics", onUseKaraokeLyricsChange);
			document.removeEventListener("lb-first-line-bold", onFirstLineBoldChange);
			document.removeEventListener("lb-adaptive-width", onAdaptiveWidthChange);
		}
	}, []);

	useEffect(() => {
		const onGlobalOffsetChange = (e) => {
			setGlobalOffset(parseInt(e.detail) ?? 0);
			setSeekCounter(+new Date());
		}
		document.addEventListener("rnp-global-offset", onGlobalOffsetChange);
		return () => {
			document.removeEventListener("rnp-global-offset", onGlobalOffsetChange);
		}
	}, []);

	useEffect(() => {
		if (adaptiveWidth) {
			containerRef.current.parentElement.parentElement.classList.add("adaptive-width");
		} else {
			containerRef.current.parentElement.parentElement.classList.remove("adaptive-width");
		}
		onResize();
	}, [adaptiveWidth]);

	const setCurrentLineWidth = (width) => {
		containerRef.current.parentElement.parentElement.style.setProperty("--current-line-width", `${width}px`);
	}

	return (
		<>
			<div
				className={`rnp-lyrics ${isPureMusic ? 'pure-music' : ''} ${firstLineBold ? 'first-line-bold' : ''}`}
				ref={containerRef}
				style={{
					fontSize: `${fontSize}px`,
				}}>
				{visible && lyrics && lyrics.slice(windowStart, windowEnd).map((line, localIndex) => {
					const index = windowStart + localIndex;
					return <Line
						key={`${songId} ${index}`}
						id={index}
						line={line}
						wordFps={wordFps}
						lyrics={lyrics}
						currentLine={currentLine}
						currentTime={currentTime.current + globalOffset}
						seekCounter={seekCounter}
						playState={playState}
						showTranslation={showTranslation}
						showRomaji={showRomaji}
						useKaraokeLyrics={useKaraokeLyrics}
						transforms={getLineTransform(index)}
						outOfRangeKaraoke={/*length > 100 && */Math.abs(index - currentLine) > 2}
						fontSize={fontSize}
						containerWidth={containerWidth}
						adaptiveWidth={adaptiveWidth}
						setCurrentLineWidth={setCurrentLineWidth}
					/>
				})}
			</div>
		</>
	);
}
function Line(props) {
	if (props.line.originalLyric == '') {
		props.line.isInterlude = true;
	}
	const offset = props.id - props.currentLine;

	const lineRef = useRef(null);

	useEffect(() => {
		if (!props.adaptiveWidth) {
			return;
		}
		if (offset == 0) {
			let maxWidth = 0;
			for (let i = 0; i < lineRef.current.children.length; i++) {
				const child = lineRef.current.children[i];
				maxWidth = Math.max(maxWidth, child.offsetWidth);
			}
			props.setCurrentLineWidth(maxWidth);
		}
	}, [props.currentLine, props.adaptiveWidth, props.useKaraokeLyrics, props.showRomaji, props.showTranslation, props.fontSize]);

	return (
		<div
			ref={lineRef}
			className={`rnp-lyrics-line ${props.line.isInterlude ? 'rnp-interlude' : ''}`}
			data-lyric-index={props.id}
			offset={offset}
			style={{
				transform: `
					translateY(${props.transforms.top}px)
				`,
				transitionDelay: `${props.transforms.delay}ms`,
				transitionDuration: `${props.transforms?.duration ?? 500}ms`,
				visibility: offset > 2 || offset < -2 ? 'hidden' : 'visible',
			}}>
			{ props.line.dynamicLyric && props.useKaraokeLyrics && 
				<SingleLineScroller {...props} active='karaoke'/>
			}
			{ !(props.line.dynamicLyric && props.useKaraokeLyrics) && props.line.originalLyric &&
				<SingleLineScroller {...props} active='original'/>
			}
			{ props.line.romanLyric && props.showRomaji && 
				<SingleLineScroller {...props} active='romaji'/>
			}
			{ props.line.translatedLyric && props.showTranslation && 
				<SingleLineScroller {...props} active='translated'/>
			}
			{ props.line.isInterlude && <Interlude
				id={props.id}
				line={props.line}
				currentLine={props.currentLine}
				currentTime={props.currentTime}
				seekCounter={props.seekCounter}
				playState={props.playState}
			/> }
		</div>
	)
}
function easeInOutSine(x) {
	return -(Math.cos(Math.PI * x) - 1) / 2;
}
function SingleLineScroller(props) {
	const wrapper = useRef(null);
	useEffect(() => {
		const element = wrapper.current;
		if (!element) return;
		let frame = null;
		let cancelled = false;
		element.style.transform = '';
		if (window.__lyricBarObsViewer || props.adaptiveWidth || props.currentLine !== props.id) return;
		const width = element.offsetWidth;
		const overflow = Math.max(0, width - props.containerWidth);
		const duration = Number(props.line.duration) || 0;
		if (width <= 0 || overflow <= 0 || duration <= 0) return;
		const scrollDuration = duration * overflow / width;
		const delay = duration * (width - overflow) / (2 * width);
		const baseTime = props.currentTime - props.line.time;
		const start = performance.now();
		let lastOffset = null;
		const draw = (now) => {
			if (cancelled) return;
			const elapsed = baseTime + (props.playState ? now - start : 0);
			const fraction = Math.min(1, Math.max(0, (elapsed - delay) / scrollDuration));
			const offset = overflow * easeInOutSine(fraction);
			if (offset !== lastOffset) element.style.transform = 'translateX(-' + offset + 'px)';
			lastOffset = offset;
			if (props.playState && fraction < 1) frame = requestAnimationFrame(draw);
		};
		draw(start);
		return () => { cancelled = true; if (frame !== null) cancelAnimationFrame(frame); };
	}, [props.adaptiveWidth, props.currentLine, props.id, props.currentTime, props.playState,
		props.seekCounter, props.containerWidth, props.fontSize, props.line, props.active, props.firstLineBold]);
	return <div className="rnp-lyrics-single-line-wrapper" ref={wrapper}><SingleLine {...props}/></div>;
}

function SingleLine(props) {
	const getKaraokeAnimation = (word) => {
		if (props.currentLine != props.id){
			return {
				transitionDuration: `200ms`,
				transitionDelay: `0ms`,
			};
		}
		if (props.playState == false && word.time + word.duration - props.currentTime > 0) {
			return {
				transitionDuration: `0s`,
				transitionDelay: `0ms`,
				opacity: Math.max(0.4 + 0.6 * (props.currentTime - word.time) / word.duration, 0.4),
				transform: `translateY(-${Math.max((props.currentTime - word.time) / word.duration * 2, 0)}px)`
			};
		}
		return {
			transitionDuration: `${word.duration}ms, ${word.duration + 150}ms`,
			transitionDelay: `${word.time - props.currentTime}ms`
		};
	};

	const karaokeLineRef = useRef(null);
	useEffect(() => {
		if (props.wordFps > 0) return;
		if (props.currentLine != props.id) return;
		if (!karaokeLineRef.current) return;
		karaokeLineRef.current.classList.add('force-refresh');
		setTimeout(() => {
			if (!karaokeLineRef.current) return;
			karaokeLineRef.current.classList.remove('force-refresh');
		}, 6);
	}, [props.useKaraokeLyrics, props.seekCounter, props.wordFps]);

	const CJKRegex = /([\p{Unified_Ideograph}\u3040-\u309F\u30A0-\u30FF])/u;

	return (
		<>
			{ props.active === 'karaoke' && props.wordFps > 0 && <LimitedKaraokeLine line={props.line}
                active={props.currentLine === props.id} passed={props.currentLine > props.id} currentTime={props.currentTime}
                playState={props.playState} seekCounter={props.seekCounter} fps={props.wordFps} bar/> }
            { props.active == 'karaoke' && props.wordFps === 0 && <div className="rnp-lyrics-line-karaoke" ref={karaokeLineRef}>
				{props.line.dynamicLyric.map((word, index) => {
					return <span
						key={`${index}`}
						className={`rnp-karaoke-word lyricbar-karaoke-word ${CJKRegex.test(word.word) ? 'is-cjk' : ''} ${word.word.endsWith(' ') ? 'end-with-space' : ''}`}
						style={getKaraokeAnimation(word)}>
							<span>{word.word}</span>
					</span>
				})}
			</div> }
			{ props.active == 'original' && <div className="rnp-lyrics-line-original">
				{ props.line.originalLyric }
			</div> }
			{ props.active == 'romaji' && <div className="rnp-lyrics-line-romaji">
				{ props.line.romanLyric }
			</div> }
			{ props.active == 'translated' && <div className="rnp-lyrics-line-translated">
				{ props.line.translatedLyric }
			</div> }
		</>
	)
}

function Interlude(props) {
	const dotContainerRef = useRef(null);

	const dotCount = 3;
	const perDotTime = parseInt(props.line.duration / dotCount);
	const dots = [];
	for (let i = 0; i < dotCount; i++) {
		dots.push({
			time: props.line.time + perDotTime * i,
			duration: perDotTime,
		});
	}
	const dotAnimation = (dot) => {
		if (dotContainerRef.current) dotContainerRef.current.classList.add('pause-breath');
		if (props.currentLine != props.id){
			return {
				transitionDuration: `200ms`,
				transitionDelay: `0ms`,
			};
		}
		if (props.playState == false && dot.time + dot.duration - props.currentTime > 0) {
			return {
				transitionDuration: `0s`,
				transitionDelay: `0ms`,
				opacity: Math.max(0.2 + 0.7 * (props.currentTime - dot.time) / dot.duration, 0.2),
				transform: `scale(${Math.max(0.9 + 0.1 * (props.currentTime - dot.time) / dot.duration * 2, 0.8)}px)`
			};
		}
		if (dotContainerRef.current) dotContainerRef.current.classList.remove('pause-breath');
		return {
			transitionDuration: `${dot.duration}ms, ${dot.duration + 150}ms`,
			transitionDelay: `${dot.time - props.currentTime}ms`
		};
	};

	useEffect(() => {
		if (props.currentLine != props.id) return;
		if (!dotContainerRef.current) return;
		dotContainerRef.current.classList.add('force-refresh');
		setTimeout(() => {
			dotContainerRef.current?.classList?.remove('force-refresh');
		}, 6);
	}, [props.seekCounter]);

	return (
		<div className="rnp-interlude-inner" ref={dotContainerRef}>
			{dots.map((dot, index) => {
				return <div
					key={index}
					className="rnp-interlude-dot"
					style={dotAnimation(dot)}
				/>
			})}
		</div>
	)
}
