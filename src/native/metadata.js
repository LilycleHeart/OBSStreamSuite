const text = value => typeof value === 'string' ? value.trim() : '';
export function coverUrl(value) {
    let url = text(value).replace(/^orpheus:\/\/cache\/\?/, '');
    if (url.startsWith('//')) url = 'https:' + url;
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) return '';
        // Artwork only: never forward local files, native URI handlers, or credentials.
        if (parsed.username || parsed.password) return '';
        return parsed.href;
    } catch { return ''; }
}
export function normalizeSong(playing, fallback = {}) {
    const data = playing?.data || playing?.track || playing || {};
    const album = data.album || data.al || {};
    const artists = data.artists || data.ar || [];
    const title = text(data.name) || text(data.title) || text(fallback.title);
    if (!title) return null;
    const durationMs = Number(data.duration ?? data.dt);
    return {
        id: String(data.id ?? playing?.id ?? title), title,
        artist: Array.isArray(artists) ? artists.map(a => text(a.name || a)).filter(Boolean).join(' / ') || text(fallback.artist) : text(artists) || text(fallback.artist),
        album: text(album.name) || text(fallback.album),
        cover: coverUrl(album.picUrl || album.cover || data.picUrl || fallback.cover),
        duration: Number.isFinite(durationMs) && durationMs > 0 ? durationMs / 1000 : 0
    };
}
