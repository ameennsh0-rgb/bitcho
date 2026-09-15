const http = require('http');
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TORBOX_API_KEY = process.env.TORBOX_API_KEY;

async function scrapeMagnetLink(searchQuery) {
    try {
        console.log(`[BitChord Intercept] Searching Torrents for: ${searchQuery}`);
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

    // STREMIO MANIFEST (BitChord calls this first to read the addon specs)
    if (urlObj.pathname === '/manifest.json') {
        return res.end(JSON.stringify({
            id: "org.private.bitchordtb",
            name: "BitChord TorBox Scraper",
            version: "1.0.0",
            description: "Direct Torrent Scraper to TorBox pipeline for BitChord.",
            resources: ["stream"],
            types: ["music", "movie", "series"], // Catching multiple meta types
            idPrefixes: ["yt_", "tt_"] // Matches YouTube IDs or track prefixes
        }));
    }

    // THE FIX: BitChord handles stream requests using the Stremio protocol format: /stream/{type}/{id}.json
    if (urlObj.pathname.startsWith('/stream/')) {
        const pathSegments = urlObj.pathname.split('/');
        // Extract the song id or search string from the path
        const rawTrackId = pathSegments[pathSegments.length - 1].replace('.json', '');
        
        // Decode and clean up track names passed by the client framework
        const cleanTrackName = decodeURIComponent(rawTrackId).replace('yt_', '').replace(/_/g, ' ');

        // 1. Scrape the open trackers for a high-quality audio file
        const torrent = await scrapeMagnetLink(cleanTrackName);
        if (!torrent) {
            // Return empty streams array so BitChord transparently falls back to regular YouTube audio
            return res.end(JSON.stringify({ streams: [] }));
        }

        // 2. Trigger the download automatically to your TorBox cloud drive
        await cacheToTorBox(torrent.magnet);
        
        // 3. Return an instruction payload back to the client app
        return res.end(JSON.stringify({
            streams: [
                {
                    title: `☁️ TorBox Caching: ${torrent.name}`,
                    url: "https://torbox.app" // Keeps BitChord satisfied while the cache builds
                }
            ]
        }));
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Route Unmapped" }));
});

server.listen(PORT, () => {
    console.log(`BitChord Backend Scraper running on port ${PORT}`);
});
