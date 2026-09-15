const http = require('http');
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TORBOX_API_KEY = process.env.TORBOX_API_KEY;

async function scrapeMagnetLink(searchQuery) {
    try {
        console.log(`[BitChord Intercept Search]: ${searchQuery}`);
        // Appending 'flac' to force BitChord to latch onto lossless tracks
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

    // 1. MANIFEST - Telling BitChord we support the "search" catalog resource
    if (urlObj.pathname === '/manifest.json') {
        return res.end(JSON.stringify({
            id: "org.private.bitchordtb",
            name: "BitChord TorBox Scraper",
            version: "1.5.0",
            description: "Direct Torrent Scraper to TorBox pipeline.",
            resources: ["catalog", "stream"], // Added catalog permission
            types: ["music"],
            catalogs: [
                {
                    type: "music",
                    id: "tb_music_search",
                    name: "TorBox Search",
                    extra: [{ name: "search", required: true }] // Tells BitChord it handles search parameters
                }
            ],
            idPrefixes: ["yt_", "tb_"]
        }));
    }

    // 2. THE FIX: Catching BitChord's catalog search request
    if (urlObj.pathname.startsWith('/catalog/music/tb_music_search')) {
        // Extract search query string passed like /catalog/music/tb_music_search/search=Artist%20Track.json
        const cleanQueryPath = decodeURIComponent(urlObj.pathname);
        const searchMatch = cleanQueryPath.match(/search=([^/.]+)/);
        
        if (!searchMatch) {
            return res.end(JSON.stringify({ metas: [] }));
        }

        const cleanTrackName = searchMatch[1].replace(/_/g, ' ');

        // Trigger background search and debrid upload pipeline
        const torrent = await scrapeMagnetLink(cleanTrackName);
        if (torrent) {
            await cacheToTorBox(torrent.magnet);
        }

        // Return a mock Stremio catalog item so BitChord marks the layout query as successful
        return res.end(JSON.stringify({
            metas: [
                {
                    id: `tb_${encodeURIComponent(cleanTrackName)}`,
                    type: "music",
                    name: torrent ? `☁️ Pushed to TorBox: ${torrent.name}` : `Searching...`,
                    poster: ""
                }
            ]
        }));
    }

    // 3. Fallback streaming block router
    if (urlObj.pathname.startsWith('/stream/')) {
        return res.end(JSON.stringify({
            streams: [{ title: "TorBox Stream Node Cache Active", url: "https://torbox.app" }]
        }));
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Route Unmapped" }));
});

server.listen(PORT, () => {
    console.log(`BitChord Addon Server resolving search catalogs on port ${PORT}`);
});
