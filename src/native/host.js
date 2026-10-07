import '../../vendor/lyric-bar/src/styles.scss';
import '../../vendor/lyric-bar/src/other-themes-compatibility.scss';
import {LyricBar} from '../../vendor/lyric-bar/src/lyric-bar.js';
import {Settings} from '../../vendor/lyric-bar/src/settings.js';
import {createRoot} from 'react-dom/client';
export async function startHost(){
    await betterncm.utils.waitForElement('#main-player');
    if(document.querySelector('[data-obs-suite-native]'))return;
    document.body.classList.add('refined-now-playing');
    if(!loadedPlugins.MaterialYouTheme)document.body.classList.add('no-material-you-theme');
    const root=document.createElement('div');root.className='lyric-bar';root.dataset.obsSuiteNative='';ReactDOM.render(React.createElement(LyricBar),root);document.body.appendChild(root);
}
export function makeLegacySettings(){const element=document.createElement('div');createRoot(element).render(React.createElement(Settings));return element;}
