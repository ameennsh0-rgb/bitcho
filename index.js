const http = require('http');
const URL = require('url').URL;
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TORBOX_API_KEY = process.env.TORBOX_API_KEY;

// 1. ADVANCED MANIFEST (Declares support for stream, search, catalogs, and setting modules)
const ADDON_MANIFEST = {
    id: "org.private.bitchordtb",
    name: "BitChord TorBox Scraper Pro",
    version: "3.0.0",
    description: "Multi-Featured Torrent Scraper to TorBox pipeline supporting Search, Catalogs, Settings, ISRC, and Instant Resolvers.",
    resources: ["stream", "catalog", "search", "settings"],
    types: ["music"],
    catalogs: [
        {
            type: "music",
            id: "tb_music_search",
            name: "TorBox Advanced Search",
            extra: [{ name: "search", required: true }]
        }
    ],
    idPrefixes: ["yt_", "isrc_", "tb_"]
};

// 2. EXTRACT TRACK DATA FROM YOUTUBE ID
async function fetchTrackNameFromYT(ytId) {
    try {
        console.log(`[YT Resolve] Looking up Video ID: ${ytId}`);
        const response = await axios.get(`https://youtube.com{ytId}&format=json`, { timeout: 3000 });
        if (response.data && response.data.title) {
            return response.data.title
                .replace(/\(Official.*?\)/gi, '')
                .replace(/\[Official.*?\]/gi, '')
                .replace(/Lyrics/gi, '')
                .trim();
        }
    } catch (err) {
        console.error("[YT Error] Meta Lookup Failed:", err.message);
    }
    return null;
}

// 3. ISRC TRACK LOOKUP (Resolves high-fidelity details from international audio tracking IDs)
async function fetchTrackFromISRC(isrcCode) {
    try {
        console.log(`[ISRC Lookup] Resolving code: ${isrcCode}`);
        // Using open-source MusicBrainz registry API
        const response = await axios.get(`https://musicbrainz.org{isrcCode}&fmt=json`, { 
            headers: { 'User-Agent': 'BitChordTorBoxScraper/3.0.0 ( private@addon.com )' },
            timeout: 3000 
        });
        if (response.data && response.data.recordings && response.data.recordings.length > 0) {
            const track = response.data.recordings[0];
            const artist = track['artist-credit'] ? track['artist-credit'][0].name : '';
            return `${artist} ${track.title}`.trim();
        }
    } catch (err) {
        console.error("[ISRC Error] MusicBrainz match failed:", err.message);
    }
    return null;
}

// 4. SCRAPE MULTI-MIRROR ENGINE FOR FLAC TORRENTS
async function scrapeMagnetLink(searchQuery) {
    const mirrorEndpoints = [
        'https://tpb.party',
        'https://piratebayproxy.info',
        'https://thepiratebay0.org'
    ];

    console.log(`[Scraper Engine] Searching mirrors for: "${searchQuery}"`);
    const encodedQuery = encodeURIComponent(searchQuery + " flac"); 

    for (let i = 0; i < mirrorEndpoints.length; i++) {
        const baseApi = mirrorEndpoints[i];
        try {
            const response = await axios.get(`${baseApi}${encodedQuery}`, { timeout: 4000 });
            
            if (response.data && response.data.length > 0) {
                const results = Array.isArray(response.data) ? response.data : [response.data];
                const topTorrent = results[0];
                
                if (topTorrent && topTorrent.info_hash && topTorrent.info_hash !== "0") {
                    console.log(`[Scraper Success] Selected Torrent: ${topTorrent.name}`);
                    return {
                        hash: topTorrent.info_hash.toLowerCase(),
                        magnet: `magnet:?xt=urn:btih:${topTorrent.info_hash}&dn=${encodeURIComponent(topTorrent.name)}`,
                        name: topTorrent.name
                    };
                }
            }
        } catch (err) {
            console.warn(`[Mirror Node Status] Endpoint offline or timeout: ${baseApi}`);
            continue; 
        }
    }
    return null;
}

// 5. CACHE CONTROL & DIRECT LINK RESOLVER
async function getTorBoxStreamOrCache(torrentData) {
    if (!torrentData) return null;
    try {
        const listResponse = await axios.get('https://torbox.app', {
            headers: { 'Authorization': `Bearer ${TORBOX_API_KEY}` }
        });

        if (listResponse.data && listResponse.data.success) {
            const existingTorrent = listResponse.data.detail.find(t => t.hash.toLowerCase() === torrentData.hash);
            
            if (existingTorrent && existingTorrent.progress === 1) {
                console.log(`[TorBox Cloud Router] Torrent Cached! Requesting direct cloud stream link...`);
                const linkResponse = await axios.get(`https://torbox.app{TORBOX_API_KEY}&torrent_id=${existingTorrent.id}`);
                if (linkResponse.data && linkResponse.data.success) {
                    return linkResponse.data.detail; 
                }
            }
        }

        console.log(`[TorBox Action] Caching file bundle background tasks initialized...`);
        await axios.post('https://torbox.app', 
            { magnet: torrentData.magnet, seed: 2, allow_as_needed: true },
            { headers: { 'Authorization': `Bearer ${TORBOX_API_KEY}`, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error("[TorBox Fail] Communication Handshake Broken:", err.message);
    }
    return null;
}

// 6. MASTER REQ ROUTER FOR ALL BITCHORD PARAMS
const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');

    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    console.log(`[Pipeline Connection]: Caught Request Path -> ${urlObj.pathname}${urlObj.search}`);

    // Route A: Settings Configuration Dashboard Endpoint Request
    if (urlObj.pathname === '/settings') {
        return res.end(JSON.stringify({
            status: "configured",
            torbox_connected: TORBOX_API_KEY ? true : false,
            audio_priority: "Lossless FLAC Preferred",
            features: ["ISRC Lookup", "Multi-Mirror Scrape", "Auto-Cache Async Engine"]
        }));
    }

    // Route B: Resolve Logic Parameters (Tapped song play commands / Stream searches)
    const ytId = urlObj.searchParams.get('id') || urlObj.searchParams.get('video_id');
    const isrcId = urlObj.searchParams.get('isrc');
    const catalogSearch = urlObj.searchParams.get('search');

    if (ytId || isrcId || catalogSearch || urlObj.pathname.includes('/stream/') || urlObj.pathname.includes('/catalog/')) {
        let cleanSearchQuery = "";

        // Parse logic variations depending on how app constructs requests
        if (isrcId) {
            cleanSearchQuery = await fetchTrackFromISRC(isrcId);
        } else if (ytId) {
            cleanSearchQuery = await fetchTrackNameFromYT(ytId);
        } else if (catalogSearch) {
            cleanSearchQuery = decodeURIComponent(catalogSearch).replace(/_/g, ' ');
        } else {
            const segments = urlObj.pathname.split('/');
            const lastSegment = segments[segments.length - 1].replace('.json', '');
            cleanSearchQuery = decodeURIComponent(lastSegment).replace('yt_', '').replace('isrc_', '').replace(/_/g, ' ');
        }

        // Drop out cleanly if metadata filters can't extract structural text
        if (!cleanSearchQuery || cleanSearchQuery.trim() === "" || cleanSearchQuery === "manifest") {
            return res.end(JSON.stringify(ADDON_MANIFEST));
        }

        // Trigger processing operations backend queues
        const torrent = await scrapeMagnetLink(cleanSearchQuery);
        const realStreamUrl = await getTorBoxStreamOrCache(torrent);

        // Standardized Multi-Format Object returns to safely pass catalog blocks or raw streaming links
        return res.end(JSON.stringify({
            url: realStreamUrl || "https://soundhelix.com",
            quality: realStreamUrl ? "Hi-Res FLAC" : "Caching to Cloud Drive... Re-tap song to stream.",
            source: "TorBox Debrid Cloud",
            metas: [{
                id: `tb_${encodeURIComponent(cleanSearchQuery)}`,
                type: "music",
                name: cleanSearchQuery,
                description: torrent ? `Cached: ${torrent.name}` : "Searching music networks..."
            }],
            streams: [{
                name: "TorBox Audio Stream",
                title: torrent ? `FLAC | ${torrent.name}` : "Proxy Buffer Stream Active",
                url: realStreamUrl || "https://soundhelix.com"
            }]
        }));
    }

    // Default Fallback: Manifest payload to confirm valid script initialization mapping
    return res.end(JSON.stringify(ADDON_MANIFEST));
});

server.listen(PORT, () => {
    console.log(`BitChord Multi-Feature Engine active on port ${PORT}`);
});
