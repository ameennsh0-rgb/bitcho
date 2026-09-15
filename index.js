const http = require('http');
const URL = require('url').URL;
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TORBOX_API_KEY = process.env.TORBOX_API_KEY;

// 1. ULTRA-STABLE PUBLIC TORRENT SCRAPER (Uses TorrentProject API instead of broken TPB mirrors)
async function scrapeMagnetLink(searchQuery) {
    try {
        console.log(`[Scraper Engine] Initiating high-stability search for: "${searchQuery}"`);
        const cleanQuery = searchQuery.replace(/[^a-zA-Z0-9 ]/g, ''); // Clear special characters
        const encodedQuery = encodeURIComponent(cleanQuery + " flac"); 
        
        // Query TorrentProject API (Very reliable, fast response times, no Cloudflare block)
        const targetUrl = `https://torrentproject2.se{encodedQuery}`;
        const response = await axios.get(targetUrl, { timeout: 5000 });
        
        // TorrentProject returns an object with a total result count and dynamic numeric keys for hits
        if (response.data && response.data.total_found > 0) {
            // Pick the first result item (index "0")
            const topTorrent = response.data["0"];
            if (topTorrent && topTorrent.torrent_hash) {
                const infoHash = topTorrent.torrent_hash.toLowerCase();
                const torrentName = topTorrent.title;
                
                console.log(`[Scraper Success] Found target match: ${torrentName}`);
                return {
                    hash: infoHash,
                    magnet: `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(torrentName)}`,
                    name: torrentName
                };
            }
        }
    } catch (err) {
        console.error(`[Scraper Error] Main API dropped connection: ${err.message}`);
    }
    return null;
}

// 2. CHECK TORBOX FOR INSTANT STREAM LINK
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
    
    // Extract query text parameters matching BitChord format structures
    const textQuery = urlObj.searchParams.get('q') || urlObj.searchParams.get('search');

    if (textQuery) {
        const cleanSearchString = decodeURIComponent(textQuery).trim();
        console.log(`[BitChord Unified Addon Request]: Parsing string -> "${cleanSearchString}"`);

        // Execute background scraping pipelines 
        const torrent = await scrapeMagnetLink(cleanSearchString);
        const realStreamUrl = await getTorBoxStreamOrCache(torrent);

        // BITCHORD SYSTEM INTERFACE OBJECT FORMAT:
        return res.end(JSON.stringify({
            url: realStreamUrl || `https://cobalt.tools`, 
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
        version: "4.0.0",
        description: "Direct Text Search and Stable Torrent Scraper to TorBox pipeline.",
        resources: ["stream", "search"],
        types: ["music"]
    }));
});

server.listen(PORT, () => {
    console.log(`BitChord Upgraded Search Engine active on port ${PORT}`);
});
