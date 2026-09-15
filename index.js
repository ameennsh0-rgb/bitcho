const http = require('http');
const URL = require('url').URL;
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TORBOX_API_KEY = process.env.TORBOX_API_KEY;

// 1. HIGH-AVAILABILITY SEARXNG MULTI-TRACKER AGGREGATOR
async function scrapeMagnetLink(searchQuery) {
    // Utilizing an open, high-availability public SearXNG engine instance instance
    const searxInstances = [
        'https://mdcnet.de',
        'https://searx.be',
        'https://searx.space'
    ];

    console.log(`[Meta Engine] Querying multi-tracker arrays for: "${searchQuery}"`);
    const cleanQuery = searchQuery.replace(/[^a-zA-Z0-9 ]/g, '').trim();
    const finalSearchString = `${cleanQuery} flac`;

    for (let i = 0; i < searxInstances.length; i++) {
        const baseInstanceUrl = searxInstances[i];
        try {
            // SearXNG natively filters open P2P networks using explicit categories variables
            const targetUrl = `${baseInstanceUrl}?q=${encodeURIComponent(finalSearchString)}&categories=files&format=json`;
            const response = await axios.get(targetUrl, { 
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                timeout: 4500 
            });

            if (response.data && response.data.results && response.data.results.length > 0) {
                // Loop through array results to locate the first entry containing a valid cryptographic magnet link string
                for (let j = 0; j < response.data.results.length; j++) {
                    const item = response.data.results[j];
                    if (item.magnetlink && item.magnetlink.startsWith('magnet:')) {
                        // Extract cryptographic infohash fingerprint out of the raw text layout string
                        const hashMatch = item.magnetlink.match(/btih:([a-fA-F0-9]{40})/);
                        const infoHash = hashMatch ? hashMatch[1].toLowerCase() : "";

                        if (infoHash) {
                            console.log(`[Aggregator Success] Found structural match via ${item.engine || 'P2P Swarm'}: ${item.title}`);
                            return {
                                hash: infoHash,
                                magnet: item.magnetlink,
                                name: item.title || "Lossless Audio Track Collection"
                            };
                        }
                    }
                }
            }
        } catch (err) {
            console.warn(`[Failover Routing] Instance node timed out or restricted: ${baseInstanceUrl}`);
            continue; // Cycle automatically to next backup cluster mirror node path 
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
    const textQuery = urlObj.searchParams.get('q') || urlObj.searchParams.get('search');

    if (textQuery) {
        const cleanSearchString = decodeURIComponent(textQuery).trim();
        console.log(`[BitChord Unified Addon Request]: Parsing string -> "${cleanSearchString}"`);

        const torrent = await scrapeMagnetLink(cleanSearchString);
        const realStreamUrl = await getTorBoxStreamOrCache(torrent);

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
        version: "5.0.0",
        description: "Direct Text Search and Stable Aggregated Scraper to TorBox pipeline.",
        resources: ["stream", "search"],
        types: ["music"]
    }));
});

server.listen(PORT, () => {
    console.log(`BitChord Upgraded Search Engine active on port ${PORT}`);
});
