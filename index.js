const http = require('http');
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TORBOX_API_KEY = process.env.TORBOX_API_KEY;

async function scrapeMagnetLink(searchQuery) {
    try {
        console.log(`[BitChord Intercept Query]: ${searchQuery}`);
        // Forcing FLAC to deliver high-res audio blocks to BitChord
        const encodedQuery = encodeURIComponent(searchQuery + " flac"); 
        const response = await axios.get(`https://apibay.org{encodedQuery}`, { timeout: 4500 });
        
        if (response.data && response.data.length > 0 && response.data.info_hash !== "0") {
            const topTorrent = response.data;
            return {
                magnet: `magnet:?xt=urn:btih:${topTorrent.info_hash}&dn=${encodeURIComponent(topTorrent.name)}`,
                name: topTorrent.name
            };
        }
        return null;
    } catch (err) {
        console.error("Scraper Engine Fail:", err.message);
        return null;
    }
}

async function cacheToTorBox(magnetLink) {
    try {
        const response = await axios.post(
            'https://torbox.app',
            { magnet: magnetLink, seed: 2, allow_as_needed: true },
            { headers: { 'Authorization': `Bearer ${TORBOX_API_KEY}`, 'Content-Type': 'application/json' } }
        );
        return response.data && response.data.success ? response.data : null;
    } catch (err) {
        console.error("TorBox API Handshake Failed:", err.message);
        return null;
    }
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');

    const urlObj = new URL(req.url, `http://${req.headers.host}`);

    // 1. MANIFEST: Declaring full text search schema compatibility for BitChord's parser
    if (urlObj.pathname === '/manifest.json') {
        return res.end(JSON.stringify({
            id: "org.private.bitchordtb",
            name: "BitChord TorBox Scraper",
            version: "1.6.0",
            description: "Direct Torrent Scraper to TorBox pipeline.",
            resources: ["catalog", "stream", "search"], // Added explicit string search parameter declarations
            types: ["music"],
            catalogs: [
                {
                    type: "music",
                    id: "tb_music_search",
                    name: "TorBox Search",
                    extra: [{ name: "search", required: true }]
                }
            ],
            idPrefixes: ["yt_", "tb_"]
        }));
    }

    // 2. UNIVERSAL RESOLVER: Intercepts catalog requests and track play calls instantly
    if (urlObj.pathname.includes('/catalog/') || urlObj.pathname.includes('/stream/') || urlObj.pathname.includes('/search/')) {
        const cleanQueryPath = decodeURIComponent(urlObj.pathname);
        
        // Extract song title whether passed as a query string or a path endpoint parameter
        let trackName = "";
        const searchMatch = cleanQueryPath.match(/search=([^/.]+)/);
        
        if (searchMatch) {
            trackName = searchMatch[1];
        } else {
            const pathSegments = cleanQueryPath.split('/');
            trackName = pathSegments[pathSegments.length - 1].replace('.json', '');
        }

        const cleanTrackName = trackName.replace('yt_', '').replace('tb_', '').replace(/_/g, ' ');

        if (!cleanTrackName || cleanTrackName.trim() === "" || cleanTrackName === "manifest") {
            return res.end(JSON.stringify({ metas: [], streams: [] }));
        }

        // Trigger your personal background scraper pipeline
        const torrent = await scrapeMagnetLink(cleanTrackName);
        if (torrent) {
            await cacheToTorBox(torrent.magnet);
        }

        // Return a structural payload satisfying both Catalog displays and Stream selectors simultaneously
        return res.end(JSON.stringify({
            metas: [
                {
                    id: `tb_${encodeURIComponent(cleanTrackName)}`,
                    type: "music",
                    name: torrent ? `☁️ Pushed to TorBox: ${torrent.name}` : `Searching Torrents...`,
                    poster: ""
                }
            ],
            streams: [
                {
                    title: torrent ? `☁️ TorBox Caching: ${torrent.name}` : `Streaming Fallback Audio Node`,
                    url: "https://torbox.app" 
                }
            ]
        }));
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Endpoint Path Unmapped" }));
});

server.listen(PORT, () => {
    console.log(`Universal BitChord Scraper listening on port ${PORT}`);
});
