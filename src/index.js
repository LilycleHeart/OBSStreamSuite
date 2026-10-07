import {createRuntime} from './native/runtime.js';
import {installObsBridge} from './native/lyric-bridge.js';
import {initializeLyricSettings} from './native/lyric-settings.js';
import {startSongPublisher,initializeSongSettings} from './native/song-publisher.js';
import {makeSettings} from './ui/settings.js';
const runtime=createRuntime(plugin);
plugin.onLoad(async()=>{initializeLyricSettings();initializeSongSettings();await runtime.prepare();await betterncm.utils.waitForElement('#main-player');installObsBridge();await startSongPublisher();});
plugin.onConfig(()=>makeSettings());
