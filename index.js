const http = require('http');
const URL = require('url').URL;
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TORBOX_API_KEY = process.env.TORBOX_API_KEY;

// 1. STABLE MIRROR SCRAPER FOR HIGH-FIDELITY TRACKS
async function scrapeMagnetLink(searchQuery) {
    const mirrorEndpoints = [
        'https://tpb.party',
        'https://piratebayproxy.info',
        'https://thepiratebay0.org'
    ];

    console.log(`[Scraper Engine] Searching active mirrors for: "${searchQuery}"`);
    const encodedQuery = encodeURIComponent(searchQuery + " flac"); 

    for (let i = 0; i < mirrorEndpoints.length; i++) {
        const baseApi = mirrorEndpoints[i];
        try {
            const response = await axios.get(`${baseApi}${encodedQuery}`, { timeout: 4000 });
            
            if (response.data && response.data.length > 0) {
                const results = Array.isArray(response.data) ? response.data : [response.data];
                const topTorrent = results[0]; // Isolate top seeded result array item
                
                if (topTorrent && topTorrent.info_hash && topTorrent.info_hash !== "0") {
                    console.log(`[Scraper Success] Found target match: ${topTorrent.name}`);
                    return {
                        hash: topTorrent.info_hash.toLowerCase(),
                        magnet: `magnet:?xt=urn:btih:${topTorrent.info_hash}&dn=${encodeURIComponent(topTorrent.name)}`,
                        name: topTorrent.name
                    };
                }
            }
        } catch (err) {
            console.warn(`[Mirror Failover] Node timed out or offline: ${baseApi}`);
            continue; 
        }
    }
    return null;
}

// 2. CHECK TORBOX FOR INSTANT LINK OR COMMAND ASYNC CACHING
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
                console.log(`[TorBox Cloud Router]: Torrent Completed! Fetching stream link...`);
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

// BITCHORD MASTER API HANDLER
const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');

    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    
    // Extract query text parameters strings directly matching BitChord's payload format structures
    const textQuery = urlObj.searchParams.get('q') || urlObj.searchParams.get('search');

    if (textQuery) {
        const cleanSearchString = decodeURIComponent(textQuery).trim();
        console.log(`[BitChord Unified Addon Request]: Parsing string -> "${cleanSearchString}"`);

        // Execute background scraping pipelines 
        const torrent = await scrapeMagnetLink(cleanSearchString);
        const realStreamUrl = await getTorBoxStreamOrCache(torrent);

        // BITCHORD EXTENSION INTERFACE OBJECT FORMAT:
        // Returns immediate high-speed audio resolution parameters back to the system media controllers
        return res.end(JSON.stringify({
            url: realStreamUrl || `https://cobalt.tools`, // Fallback stream node paths
            quality: realStreamUrl ? "Hi-Res FLAC" : "Caching to Cloud drive... Re-tap song to play.",
            source: realStreamUrl ? "TorBox Debrid Cloud" : "Proxy Streaming Node Active",
            streams: [{
                name: "TorBox Lossless Engine",
                title: torrent ? torrent.name : "System Resolver Active",
                url: realStreamUrl || "https://soundhelix.com"
            }]
        }));
    }

    // Default manifest placeholder validation layout
    return res.end(JSON.stringify({
        id: "org.private.bitchordtb",
        name: "BitChord TorBox Scraper Pro",
        version: "3.6.0",
        description: "Direct Text Search and Torrent Scraper to TorBox pipeline.",
        resources: ["stream", "search"],
        types: ["music"]
    }));
});

server.listen(PORT, () => {
    console.log(`BitChord Universal Search Engine listening active on port ${PORT}`);
});
