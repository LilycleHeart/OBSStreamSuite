// Both OBS surfaces consume the same Material You palette and derived tones.
const darkDefaults = {primary:[198,191,255],secondary:[227,223,249],background:[29,27,32],ink:[255,255,255]};
const lightDefaults = {primary:[101,85,143],secondary:[73,66,87],background:[255,251,254],ink:[0,0,0]};
function rgb(value) {
    if(typeof value !== 'string')return null;
    const match=value.trim().match(/^(?:rgba?\()?\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)(?:\s*[,/]\s*[\d.]+)?\s*\)?$/);
    if(match)return match.slice(1,4).map(x=>Math.round(Math.max(0,Math.min(255,Number(x)))));
    const hex=value.trim().match(/^#([\da-f]{6})$/i);
    return hex?[0,2,4].map(i=>parseInt(hex[1].slice(i,i+2),16)):null;
}
const mix=(a,b,ratio)=>a.map((x,i)=>Math.round(x*(1-ratio)+b[i]*ratio));
export function applySharedTheme(theme={}) {
    const colors=theme.colors||{},fallback=theme.dark===false?lightDefaults:darkDefaults;
    const primary=rgb(colors['--md-accent-color-rgb'])||rgb(colors['--md-accent-color'])||fallback.primary;
    const secondary=rgb(colors['--md-accent-color-secondary-rgb'])||rgb(colors['--md-accent-color-secondary'])||fallback.secondary;
    const background=rgb(colors['--md-accent-color-bg-rgb'])||rgb(colors['--md-accent-color-bg'])||fallback.background;
    const ink=rgb(colors['--md-accent-color-grey-base-rgb'])||fallback.ink;
    const surface=mix(background,primary,.09),raised=mix(background,primary,.15);
    const roleColors={
        '--md-accent-color':primary,'--md-accent-color-secondary':secondary,'--md-accent-color-bg':background,
        '--obs-primary':primary,'--obs-secondary':secondary,'--obs-surface':surface,'--obs-raised':raised,
        '--obs-ink':mix(background,ink,.93),'--obs-muted':mix(background,secondary,.74)
    };
    const root=document.documentElement,style=root.style;
    for(const [name,value]of Object.entries(roleColors)){
        const color='rgb('+value.join(', ')+')';if(style.getPropertyValue(name)!==color)style.setProperty(name,color);
        const channels=value.join(', ');if(style.getPropertyValue(name+'-rgb')!==channels)style.setProperty(name+'-rgb',channels);
    }
    style.setProperty('--md-accent-color-grey-base-rgb',ink.join(', '));
    const font=theme.font||'"Microsoft YaHei UI","Microsoft YaHei",sans-serif';
    if(style.fontFamily!==font)style.fontFamily=font;
    root.dataset.palette=primary.join(',')+'|'+secondary.join(',')+'|'+background.join(',');
    window.__obsMaterialTheme={primary,secondary,background,surface,source:theme.source||'material-you'};
}
