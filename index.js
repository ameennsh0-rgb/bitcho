const http = require('http');
const URL = require('url').URL;
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TORBOX_API_KEY = process.env.TORBOX_API_KEY;

// 1. HIGH-AVAILABILITY DECENTRALIZED DHT CRAWLER SCRAPER (Replaces unstable web trackers)
async function scrapeMagnetLink(searchQuery) {
    try {
        console.log(`[DHT Engine] Querying live file swarms for: "${searchQuery}"`);
        const cleanQuery = searchQuery.replace(/[^a-zA-Z0-9 ]/g, '').trim();
        const encodedQuery = encodeURIComponent(cleanQuery + " flac"); 
        
        // Utilizing a high-speed, open-access DHT aggregator API node
        const targetUrl = `https://bt4g.org{encodedQuery}&sort=seeders`;
        const response = await axios.get(targetUrl, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 5000 
        });
        
        if (response.data && response.data.results && response.data.results.length > 0) {
            // Target the most highly-seeded file package in the decentralized swarm layout
            const topTorrent = response.data.results[0];
            if (topTorrent && topTorrent.infohash) {
                const infoHash = topTorrent.infohash.toLowerCase().trim();
                const torrentName = topTorrent.name || "Lossless Audio Track Collection";
                
                console.log(`[Scraper Success] Intercepted valid DHT match: ${torrentName}`);
                return {
                    hash: infoHash,
                    magnet: `magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(torrentName)}`,
                    name: torrentName
                };
            }
        }
    } catch (err) {
        console.error(`[Scraper Fallback] Main search thread dropped. Attempting backup proxy layout...`);
        
        // Backup Plan: Try parsing a secondary public search API mirror if the primary DHT index experiences issues
        try {
            const backupUrl = `https://apibay.org{encodeURIComponent(searchQuery + " flac")}`;
            const backupRes = await axios.get(backupUrl, { timeout: 4000 });
            if (backupRes.data && backupRes.data.length > 0 && backupRes.data[0].info_hash !== "0") {
                const topBackup = backupRes.data[0];
                return {
                    hash: topBackup.info_hash.toLowerCase(),
                    magnet: `magnet:?xt=urn:btih:${topBackup.info_hash}&dn=${encodeURIComponent(topBackup.name)}`,
                    name: topBackup.name
                };
            }
        } catch (backupErr) {
            console.error(`[Scraper Error] All indexing parameters exhausted: ${backupErr.message}`);
        }
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
        version: "4.1.0",
        description: "Direct Text Search and Stable Torrent Scraper to TorBox pipeline.",
        resources: ["stream", "search"],
        types: ["music"]
    }));
});

server.listen(PORT, () => {
    console.log(`BitChord Upgraded Search Engine active on port ${PORT}`);
});
