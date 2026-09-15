const http = require('http');
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TORBOX_API_KEY = process.env.TORBOX_API_KEY; // Pulled securely from Render Environment Variables

async function scrapeMagnetLink(searchQuery) {
    try {
        console.log(`[BitChord Intercept] Searching Torrent Indexers for: ${searchQuery}`);
        // Forcing FLAC to give BitChord the lossless files it is looking for
        const encodedQuery = encodeURIComponent(searchQuery + " flac"); 
        
        const response = await axios.get(`https://apibay.org{encodedQuery}`, { timeout: 4500 });
        
        if (response.data && response.data.length > 0 && response.data[0].info_hash !== "0") {
            const topTorrent = response.data[0];
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
    // Add CORS headers so the Android app client isn't blocked by network policies
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');

    const urlObj = new URL(req.url, `http://${req.headers.host}`);

    // Standard health-check route to ensure Render keeps the app awake
    if (urlObj.pathname === '/' || urlObj.pathname === '/status') {
        return res.end(JSON.stringify({ status: "online", service: "BitChord TorBox Bridge" }));
    }

    // BitChord calls standard stream paths by parsing strings directly over the API request 
    if (urlObj.pathname.includes('/stream/')) {
        const pathSegments = urlObj.pathname.split('/');
        const rawTrackName = pathSegments[pathSegments.length - 1].replace('.json', '');
        const cleanTrackName = decodeURIComponent(rawTrackName).replace(/_/g, ' ');

        // 1. Scrape the open trackers
        const torrent = await scrapeMagnetLink(cleanTrackName);
        if (!torrent) {
            return res.end(JSON.stringify({ streams: [], notice: "Fallback to standard YouTube stream." }));
        }

        // 2. Cache it instantly to your TorBox cloud drive
        await cacheToTorBox(torrent.magnet);
        
        // 3. Return a clean payload structure to BitChord
        return res.end(JSON.stringify({
            streams: [],
            detail: `Caching "${torrent.name}" directly to your TorBox dashboard storage.`
        }));
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Route Unmapped" }));
});

server.listen(PORT, () => {
    console.log(`BitChord TorBox Scraper Server deployed on port ${PORT}`);
});
