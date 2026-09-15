const http = require('http');
const URL = require('url').URL;
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TORBOX_API_KEY = process.env.TORBOX_API_KEY;

// Base configuration dictionary that satisfies the structural check
const APP_MANIFEST_PAYLOAD = {
    id: "org.private.bitchordtb",
    name: "BitChord TorBox Scraper",
    version: "2.3.0",
    description: "Direct Torrent Scraper to TorBox pipeline.",
    resources: ["stream"],
    types: ["music"],
    idPrefixes: ["yt_"]
};

// 1. EXTRACT TRACK DATA FROM YOUTUBE ID
async function fetchTrackNameFromYT(ytId) {
    try {
        console.log(`[BitChord Intercept] Resolving Video ID: ${ytId}`);
        const response = await axios.get(`https://youtube.com{ytId}&format=json`, { timeout: 3000 });
        if (response.data && response.data.title) {
            return response.data.title
                .replace(/\(Official.*?\)/gi, '')
                .replace(/\[Official.*?\]/gi, '')
                .replace(/Lyrics/gi, '')
                .trim();
        }
    } catch (err) {
        console.error("YouTube Metadata Lookup Failed:", err.message);
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

    console.log(`[Scraper] Searching active torrent mirrors for: "${searchQuery}"`);
    const encodedQuery = encodeURIComponent(searchQuery + " flac"); 

    for (let i = 0; i < mirrorEndpoints.length; i++) {
        const baseApi = mirrorEndpoints[i];
        try {
            const targetUrl = `${baseApi}${encodedQuery}`;
            const response = await axios.get(targetUrl, { timeout: 4000 });
            
            if (response.data && response.data.length > 0) {
                const results = Array.isArray(response.data) ? response.data : [response.data];
                const topTorrent = results[0];
                
                if (topTorrent && topTorrent.info_hash && topTorrent.info_hash !== "0") {
                    console.log(`[Scraper Success] Bound stream from mirror node: ${topTorrent.name}`);
                    return {
                        hash: topTorrent.info_hash.toLowerCase(),
                        magnet: `magnet:?xt=urn:btih:${topTorrent.info_hash}&dn=${encodeURIComponent(topTorrent.name)}`,
                        name: topTorrent.name
                    };
                }
            }
        } catch (err) {
            console.warn(`Mirror endpoint down or timed out: ${baseApi}`);
            continue; 
        }
    }
    return null;
}

// 3. CHECK TORBOX FOR INSTANT STREAM LINK
async function getTorBoxStreamOrCache(torrentData) {
    if (!torrentData) return null;
    try {
        const listResponse = await axios.get('https://torbox.app', {
            headers: { 'Authorization': `Bearer ${TORBOX_API_KEY}` }
        });

        if (listResponse.data && listResponse.data.success) {
            const existingTorrent = listResponse.data.detail.find(function(t) {
                return t.hash.toLowerCase() === torrentData.hash;
            });
            
            if (existingTorrent && existingTorrent.progress === 1) {
                console.log(`[TorBox Cache Check]: Torrent Completed! Fetching stream link...`);
                const linkResponse = await axios.get(`https://torbox.app{TORBOX_API_KEY}&torrent_id=${existingTorrent.id}`);
                if (linkResponse.data && linkResponse.data.success) {
                    return linkResponse.data.detail; 
                }
            }
        }

        console.log(`[TorBox Cloud Action]: Track missing from cache. Queueing background download...`);
        await axios.post('https://torbox.app', 
            { magnet: torrentData.magnet, seed: 2, allow_as_needed: true },
            { headers: { 'Authorization': `Bearer ${TORBOX_API_KEY}`, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error("TorBox Request Engine Fail:", err.message);
    }
    return null;
}

// BITCHORD NATIVE ENDPOINT MANAGER
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
            return res.end(JSON.stringify({ url: null }));
        }

        const torrent = await scrapeMagnetLink(cleanTrackName);
        const realStreamUrl = await getTorBoxStreamOrCache(torrent);

        if (realStreamUrl) {
            return res.end(JSON.stringify({
                url: realStreamUrl,
                quality: "Hi-Res FLAC",
                source: "TorBox Debrid Cloud"
            }));
        } else {
            return res.end(JSON.stringify({
                url: "https://soundhelix.com",
                quality: "Buffering/Caching Queue",
                source: "TorBox"
            }));
        }
    }

    return res.end(JSON.stringify(APP_MANIFEST_PAYLOAD));
});

server.listen(PORT, () => {
    console.log(`BitChord Multi-Mirror Resolver active on port ${PORT}`);
});
