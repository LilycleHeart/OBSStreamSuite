import fs from 'node:fs';import path from 'node:path';import esbuild from 'esbuild';import * as sass from 'sass';
fs.mkdirSync('dist/service/public',{recursive:true});fs.mkdirSync('dist/licenses',{recursive:true});
const defines={__SONG_VIEW_URL__:'window.__obsSuiteRuntime.songViewUrl',__LYRIC_VIEW_URL__:'window.__obsSuiteRuntime.lyricViewUrl',__HEALTH_URL__:'window.__obsSuiteRuntime.healthUrl',__SONG_PUBLISH_URL__:'window.__obsSuiteRuntime.songPublishUrl',__OBS_PUBLISH_URL__:'window.__obsSuiteRuntime.lyricPublishUrl',__OBS_OVERLAY_URL__:'window.__obsSuiteRuntime.lyricViewUrl','process.env.NODE_ENV':'"production"'};
const common={bundle:true,format:'iife',target:'chrome91',loader:{'.js':'jsx'},jsxFactory:'React.createElement',jsxFragment:'React.Fragment',define:defines,minify:true};
const nativePlugin={name:'native-css-and-lyric-entry',setup(build){
    build.onLoad({filter:/\.scss$/},args=>({contents:`const style=document.createElement('style');style.textContent=${JSON.stringify(sass.compile(args.path,{logger:sass.Logger.silent}).css)};document.head.appendChild(style);`,loader:'js'}));
    build.onResolve({filter:/^\.\/lyrics\.js$/},args=>args.importer.replaceAll('\\','/').endsWith('vendor/lyric-bar/src/lyric-bar.js')?{path:path.resolve('src/lyrics/lyrics.js')}:undefined);
    build.onResolve({filter:/native-bridge\.js$/},()=>({path:path.resolve('src/native/lyric-bridge.js')}));
}};
await esbuild.build({...common,entryPoints:['src/index.js'],outfile:'dist/main.js',plugins:[nativePlugin]});
const viewerOnly={name:'viewer-only',setup(build){build.onResolve({filter:/native-bridge\.js$/},()=>({path:'noop',namespace:'viewer'}));build.onLoad({filter:/.*/,namespace:'viewer'},()=>({contents:'export function installObsBridge(){}'}));}};
for(const file of ['nowplaying','overlay']){await esbuild.build({...common,entryPoints:['src/renderer/'+file+'.js'],outfile:'dist/service/public/'+file+'.js',plugins:[viewerOnly]});fs.copyFileSync('src/renderer/'+file+'.html','dist/service/public/'+file+'.html');}
let card=fs.readFileSync('src/renderer/nowplaying.css','utf8')+'\n#card.cover-glow-off .art-frame{box-shadow:none!important}';fs.writeFileSync('dist/service/public/nowplaying.css',card);
const lyricCSS=['src/styles/rnp-lyrics.scss','vendor/lyric-bar/src/styles.scss'].map(file=>sass.compile(file,{logger:sass.Logger.silent}).css).join('\n');
fs.writeFileSync('dist/service/public/overlay.css',lyricCSS+`\nhtml,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent!important}body{--sidebar-width:0px;--lyric-timing-function:ease;--lyric-translation-size-em:1;color:var(--ncm-text);font-family:Microsoft YaHei,sans-serif}#bar-root.lyric-bar{right:0;bottom:0;left:auto;top:auto;max-width:100vw;border-radius:12px;transition:opacity .22s ease,height .5s ease,width .5s ease}#bar-root.obs-paused{opacity:0!important;pointer-events:none}\n`+fs.readFileSync('src/styles/lyric-theme.css','utf8')+'\n'+fs.readFileSync('src/styles/lyric-wrap.css','utf8'));
for(const module of ['react','react-dom'])fs.copyFileSync('node_modules/'+module+'/umd/'+module+'.production.min.js','dist/service/public/'+module+'.js');
await esbuild.build({entryPoints:['src/service/bridge-server.cjs'],outfile:'dist/service/bridge-server.cjs',bundle:true,platform:'node',target:'node20',external:['bufferutil','utf-8-validate']});
fs.copyFileSync('src/service/Start-Bridge.ps1','dist/service/Start-Bridge.ps1');fs.copyFileSync('manifest.json','dist/manifest.json');
for(const file of fs.readdirSync('licenses'))fs.copyFileSync('licenses/'+file,'dist/licenses/'+file);
for(const [label,module] of [['React','react'],['ReactDOM','react-dom'],['ws','ws']])fs.copyFileSync('node_modules/'+module+'/LICENSE','dist/licenses/'+label+'-MIT.txt');
if(fs.existsSync('preview.png'))fs.copyFileSync('preview.png','dist/preview.png');
console.log('Public build completed; runtime credentials are generated per installation.');
