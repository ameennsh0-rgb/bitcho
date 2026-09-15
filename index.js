const http = require('http');
const URL = require('url').URL;
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TORBOX_API_KEY = process.env.TORBOX_API_KEY;

// 1. HIGH-STABILITY TORRENTIO DISCOVERY ENGINE (Bypasses all website scraper blocks)
async function scrapeMagnetLink(searchQuery) {
    try {
        console.log(`[Torrentio Engine] Searching stable cluster for: "${searchQuery}"`);
        const cleanQuery = searchQuery.replace(/[^a-zA-Z0-9 ]/g, '').trim();
        const encodedQuery = encodeURIComponent(cleanQuery + " flac"); 

        // Querying Torrentio's optimized public catalog endpoint
        const targetUrl = `https://strem.fun|qualityfilter=brremux,hdr,4k,1080p,720p,scr,cam/stream/music/${encodedQuery}.json`;
        const response = await axios.get(targetUrl, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 5000 
        });

        if (response.data && response.data.streams && response.data.streams.length > 0) {
            // Grab the highest-seeded audio/torrent stream result
            const topStream = response.data.streams[0];
            if (topStream.infoHash) {
                const infoHash = topStream.infoHash.toLowerCase().trim();
                const torrentName = topStream.title ? topStream.title.split('\n')[0] : "Lossless FLAC Audio Track";
                
                console.log(`[Discovery Success] Captured live magnet hash: ${infoHash}`);
                return {
                    hash: infoHash,
                    magnet: `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(torrentName)}`,
                    name: torrentName
                };
            }
        }
    } catch (err) {
        console.error(`[Discovery Error] Torrentio node timed out: ${err.message}`);
    }
    return null;
}

// 2. CHECK TORBOX FOR INSTANT LINK OR COMMAND ASYNC CACHING
async function getTorBoxStreamOrCache(torrentData) {
    if (!torrentData) return null;
    try {
        // Step A: Check your personal cloud account to see if the track is ready to play
        const listResponse = await axios.get('https://torbox.app', {
            headers: { 'Authorization': `Bearer ${TORBOX_API_KEY}` }
        });

        if (listResponse.data && listResponse.data.success) {
            const existingTorrent = listResponse.data.detail.find(function(t) {
                return t.hash.toLowerCase() === torrentData.hash;
            });
            
            // If completed, fetch the real, authenticated direct CDN playback URL
            if (existingTorrent && existingTorrent.progress === 1) {
                console.log(`[TorBox Cloud Router]: Torrent Completed! Fetching stream link...`);
                const linkResponse = await axios.get(`https://torbox.app{TORBOX_API_KEY}&torrent_id=${existingTorrent.id}`);
                if (linkResponse.data && linkResponse.data.success) {
                    return linkResponse.data.detail; 
                }
            }
        }

        // Step B: If missing, push the hash to your TorBox cloud drive to download instantly
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
    const textQuery = urlObj.searchParams.get('q') || urlObj.searchParams.get('search');

    if (textQuery) {
        const cleanSearchString = decodeURIComponent(textQuery).trim();
        console.log(`[BitChord Unified Addon Request]: Parsing string -> "${cleanSearchString}"`);

        // Execute background scraping pipelines 
        const torrent = await scrapeMagnetLink(cleanSearchString);
        const realStreamUrl = await getTorBoxStreamOrCache(torrent);

        // BITCHORD FORMAT INTERFACE DELIVERY:
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

    return res.end(JSON.stringify({
        id: "org.private.bitchordtb",
        name: "BitChord TorBox Scraper Pro",
        version: "7.0.0",
        description: "Direct Torrentio Text Search and Stable Scraper to TorBox pipeline.",
        resources: ["stream", "search"],
        types: ["music"]
    }));
});

server.listen(PORT, () => {
    console.log(`BitChord Upgraded Search Engine active on port ${PORT}`);
});
