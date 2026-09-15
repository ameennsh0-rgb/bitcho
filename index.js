const http = require('http');
const URL = require('url').URL;
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TORBOX_API_KEY = process.env.TORBOX_API_KEY;

const APP_MANIFEST_PAYLOAD = {
    id: "org.private.bitchordtb",
    name: "BitChord TorBox Scraper Pro",
    version: "3.5.0",
    description: "Real-time streaming pipeline supporting async TorBox caching.",
    resources: ["stream"],
    types: ["music"],
    idPrefixes: ["yt_"]
};

// 1. EXTRACT TRACK DATA FROM YOUTUBE ID
async function fetchTrackNameFromYT(ytId) {
    try {
        const response = await axios.get(`https://youtube.com{ytId}&format=json`, { timeout: 3000 });
        if (response.data && response.data.title) {
            return response.data.title
                .replace(/\(Official.*?\)/gi, '')
                .replace(/\[Official.*?\]/gi, '')
                .replace(/Lyrics/gi, '')
                .trim();
        }
    } catch (err) {
        console.error("[Metadata Error]:", err.message);
    }
    return null;
}

// 2. SCRAPE ACTIVE PUBLIC MIRRORS
async function scrapeMagnetLink(searchQuery) {
    const mirrorEndpoints = [
        'https://tpb.party',
        'https://piratebayproxy.info',
        'https://thepiratebay0.org'
    ];

    const encodedQuery = encodeURIComponent(searchQuery + " flac"); 
    for (let i = 0; i < mirrorEndpoints.length; i++) {
        const baseApi = mirrorEndpoints[i];
        try {
            const response = await axios.get(`${baseApi}${encodedQuery}`, { timeout: 4000 });
            if (response.data && response.data.length > 0) {
                const results = Array.isArray(response.data) ? response.data : [response.data];
                const topTorrent = results[0];
                
                if (topTorrent && topTorrent.info_hash && topTorrent.info_hash !== "0") {
                    return {
                        hash: topTorrent.info_hash.toLowerCase(),
                        magnet: `magnet:?xt=urn:btih:${topTorrent.info_hash}&dn=${encodeURIComponent(topTorrent.name)}`,
                        name: topTorrent.name
                    };
                }
            }
        } catch (err) {
            continue; 
        }
    }
    return null;
}

// 3. RETRIEVE CACHED LINK OR QUEUE TORBOX IN BACKGROUND
async function getTorBoxStreamOrCache(torrentData) {
    if (!torrentData) return null;
    try {
        const listResponse = await axios.get('https://torbox.app', {
            headers: { 'Authorization': `Bearer ${TORBOX_API_KEY}` }
        });

        if (listResponse.data && listResponse.data.success) {
            const existingTorrent = listResponse.data.detail.find(t => t.hash.toLowerCase() === torrentData.hash);
            
            if (existingTorrent && existingTorrent.progress === 1) {
                console.log(`[TorBox Cloud Router]: Torrent Cached! Requesting link...`);
                const linkResponse = await axios.get(`https://torbox.app{TORBOX_API_KEY}&torrent_id=${existingTorrent.id}`);
                if (linkResponse.data && linkResponse.data.success) {
                    return linkResponse.data.detail; 
                }
            }
        }

        console.log(`[TorBox Action]: Triggering background cache task for: ${torrentData.name}`);
        await axios.post('https://torbox.app', 
            { magnet: torrentData.magnet, seed: 2, allow_as_needed: true },
            { headers: { 'Authorization': `Bearer ${TORBOX_API_KEY}`, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error("[TorBox Engine Fail]:", err.message);
    }
    return null;
}

// BITCHORD DIRECT ACCESS ROUTER
const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');

    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const ytId = urlObj.searchParams.get('id') || urlObj.searchParams.get('video_id');

    if (ytId) {
        const cleanTrackName = await fetchTrackNameFromYT(ytId);
        if (!cleanTrackName) {
            return res.end(JSON.stringify({ url: `https://cobalt.tools{ytId}` }));
        }

        const torrent = await scrapeMagnetLink(cleanTrackName);
        const realStreamUrl = await getTorBoxStreamOrCache(torrent);

        // THE DEFINITIVE FIX: Deliver a functional, high-speed audio stream link parameters instantly
        // If the FLAC torrent isn't cached yet, we route the audio via Cobalt open media parsing utility streams
        const finalAudioStreamUrl = realStreamUrl || `https://cobalt.tools{ytId}`;

        console.log(`[Delivery] Serving playback stream node url path -> ${finalAudioStreamUrl}`);

        return res.end(JSON.stringify({
            url: finalAudioStreamUrl,
            quality: realStreamUrl ? "Hi-Res FLAC" : "Standard Audio (Caching FLAC)",
            source: realStreamUrl ? "TorBox Debrid" : "YouTube Proxy",
            streams: [{
                name: "TorBox Premium Pipeline",
                title: torrent ? torrent.name : "System Resolver",
                url: finalAudioStreamUrl
            }]
        }));
    }

    return res.end(JSON.stringify(APP_MANIFEST_PAYLOAD));
});

server.listen(PORT, () => {
    console.log(`BitChord Multi-Feature Engine active on port ${PORT}`);
});
