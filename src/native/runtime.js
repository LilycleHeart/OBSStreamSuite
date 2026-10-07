export function createRuntime(owner) {
    const runtime={config:null,error:'',ready:false,pending:null};
    const join=(base,relative)=>base.replace(/[\\/]+$/,'')+'/'+relative.replace(/^\.\//,'');
    const quote=value=>{if(/["\r\n]/.test(value))throw Error('Unsupported path');return '"'+value+'"';};
    const hex=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
    runtime.prepare=async(force=false)=>{
        if(force)runtime.ready=false;
        if(runtime.ready)return runtime.config;
        if(runtime.pending)return runtime.pending;
        runtime.pending=(async()=>{
            try{
                const dataPath=await betterncm.app.getDataPath();
                const rawPath=owner.mainPlugin?.pluginPath||owner.pluginPath;
                const pluginPath=/^(?:[a-z]:[\\/]|\\\\)/i.test(rawPath)?rawPath:join(dataPath,rawPath);
                const destination=join(dataPath,'lyricbar-obs');
                await betterncm.fs.mkdir(destination);
                let config;try{config=JSON.parse(await betterncm.fs.readFileText(join(destination,'bridge-config.json')));}catch{}
                if(!config || !Number.isInteger(config.port))config={port:17891};
                if(!config.token)config.token=hex();if(!config.songToken)config.songToken=hex();
                await betterncm.fs.writeFileText(join(destination,'bridge-config.json'),JSON.stringify(config));
                runtime.config=config;
                if(localStorage.getItem('obs-suite-enabled')!=='false'){
                    const script=join(pluginPath,'service/Start-Bridge.ps1');
                    const command='powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File '+quote(script)+' -Destination '+quote(destination)+' -SourceDirectory '+quote(join(pluginPath,'service'));
                    await betterncm.app.exec(command,false,false);
                }
                runtime.ready=true;runtime.error='';return config;
            }catch(error){runtime.error=error.message||String(error);runtime.config ||= {port:17891,token:'',songToken:''};return runtime.config;}
            finally{runtime.pending=null;}
        })();
        return runtime.pending;
    };
    const port=()=>runtime.config?.port||17891;
    Object.defineProperties(runtime,{
        songPublishUrl:{get:()=>`ws://127.0.0.1:${port()}/song-publish?token=${encodeURIComponent(runtime.config?.songToken||'')}`},
        lyricPublishUrl:{get:()=>`ws://127.0.0.1:${port()}/publish?token=${encodeURIComponent(runtime.config?.token||'')}`},
        songViewUrl:{get:()=>`http://127.0.0.1:${port()}/nowplaying`},lyricViewUrl:{get:()=>`http://127.0.0.1:${port()}/overlay`},healthUrl:{get:()=>`http://127.0.0.1:${port()}/health`}
    });
    window.__obsSuiteRuntime=runtime;return runtime;
}
