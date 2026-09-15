const http = require('http');
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TORBOX_API_KEY = process.env.TORBOX_API_KEY || "aa36e00d-5456-4a1a-aa28-0bdee7d36f6f";

async function scrapeMagnetLink(searchQuery) {
    try {
        console.log(`[Indexer Search]: ${searchQuery}`);
        const encodedQuery = encodeURIComponent(searchQuery + " flac"); 

        const response = await axios.get(`https://apibay.org{encodedQuery}`, { timeout: 4000 });

        if (response.data && response.data.length > 0 && response.data.info_hash !== "0") {
            const topTorrent = response.data;
            return {
                magnet: `magnet:?xt=urn:btih:${topTorrent.info_hash}&dn=${encodeURIComponent(topTorrent.name)}`,
                name: topTorrent.name
            };
        }
        return null;
    } catch (err) {
        console.error("Scraper Error:", err.message);
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
        console.error("TorBox Request Fail:", err.message);
        return null;
    }
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');

    const urlObj = new URL(req.url, `http://${req.headers.host}`);

    if (urlObj.pathname === '/manifest.json') {
        return res.end(JSON.stringify({
            id: "org.private.tbmusic",
            name: "GitHub Private TorBox Scraper",
            version: "1.0.0",
            description: "Direct Torrent Scraper to TorBox pipeline.",
            resources: ["stream"],
            types: ["music"],
            idPrefixes: ["tb_"]
        }));
    }

    if (urlObj.pathname.startsWith('/stream/music/')) {
        const rawId = urlObj.pathname.split('/').pop().replace('.json', '');
        const cleanTrackName = decodeURIComponent(rawId).replace('tb_', '').replace(/_/g, ' ');

        const torrent = await scrapeMagnetLink(cleanTrackName);
        if (!torrent) {
            return res.end(JSON.stringify({ streams: [], detail: "Track missing from open indexing queues." }));
        }

        await cacheToTorBox(torrent.magnet);
        return res.end(JSON.stringify({
            streams: [], 
            detail: `Forced Cache: "${torrent.name}" pushed straight to your TorBox cloud folder.`
        }));
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Endpoint Route Invalid" }));
});

server.listen(PORT, () => {
    console.log(`Addon Live! Add manifest link to your player: /manifest.json`);
});
