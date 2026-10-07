export const lyricKeys=['lyric-font-size','show-translation','show-romaji','use-karaoke-lyrics','first-line-bold','adaptive-width','text-align','opacity','lyric-offset','karaoke-framerate','lyric-bar-width','obs-max-width','obs-morph-duration','obs-radius'];
const defaults={'lyric-font-size':'20','show-translation':'true','show-romaji':'false','use-karaoke-lyrics':'true','first-line-bold':'false','adaptive-width':'true','text-align':'left',opacity:'100','lyric-offset':'0','karaoke-framerate':'0','lyric-bar-width':'400px','obs-max-width':'0','obs-morph-duration':'500','obs-radius':'16'};
export function initializeLyricSettings(){
    for(const key of lyricKeys){const target='obs-lyrics-'+key,old=localStorage.getItem('lyric-bar-'+key);if(localStorage.getItem(target)===null)localStorage.setItem(target,old??defaults[key]);}
}
export function readLyricSetting(key,fallback=null){return localStorage.getItem('obs-lyrics-'+key)??localStorage.getItem('lyric-bar-'+key)??fallback;}
export function writeLyricSetting(key,value){localStorage.setItem('obs-lyrics-'+key,String(value));document.dispatchEvent(new CustomEvent('obs-lyrics-'+key,{detail:value}));}
