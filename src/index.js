import {createRuntime} from './native/runtime.js';
import {startHost,makeLegacySettings} from './native/host.js';
import {startSongPublisher} from './native/song-publisher.js';
import {makeSettings} from './ui/settings.js';
const runtime=createRuntime(plugin);
plugin.onLoad(async()=>{await runtime.prepare();await startHost();await startSongPublisher();});
plugin.onConfig(()=>makeSettings(makeLegacySettings));
