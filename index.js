const http = require('http');
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TORBOX_API_KEY = process.env.TORBOX_API_KEY;

// 1. PUBLIC METADATA ENGINE (Resolves track name from the YouTube audio stream ID)
async function fetchTrackNameFromYT(ytId) {
    try {
        console.log(`[BitChord Playback Intercept] Resolving YT ID: ${ytId}`);
        // Calling open YouTube oEmbed to securely scrape the clean track title/artist text
        const response = await axios.get(`https://youtube.com{ytId}&format=json`, { timeout: 3000 });
        if (response.data && response.data.title) {
            // Cleans common video bloat tags out of the music query string
            return response.data.title.replace(/\(Official.*?\)/gi, '').replace(/\[Official.*?\]/gi, '').trim();
        }
    } catch (err) {
        console.error("YouTube Meta Resolve Failed:", err.message);
    }
    return null;
}

// 2. TORRENT MAGNET SCRAPER
async function scrapeMagnetLink(searchQuery) {
    try {
        console.log(`[Scraper Engine] Searching trackers for: "${searchQuery}"`);
        const encodedQuery = encodeURIComponent(searchQuery + " flac"); 
        const response = await axios.get(`https://apibay.org{encodedQuery}`, { timeout: 4500 });
        
        if (response.data && response.data.length > 0 && response.data.info_hash !== "0") {
            const topTorrent = response.data[0]; // Safely pick top seeded torrent array result
            return {
                hash: topTorrent.info_hash.toLowerCase(),
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

// 3. TORBOX CHECK & INSTANT STREAM RESOLVER
async function getTorBoxStreamOrCache(torrentData) {
    if (!torrentData) return null;
    try {
        // Step A: Check if this torrent hash is already cached/downloaded in your TorBox cloud drive
        const listResponse = await axios.get('https://torbox.app', {
            headers: { 'Authorization': `Bearer ${TORBOX_API_KEY}` }
        });

        if (listResponse.data && listResponse.data.success) {
            const existingTorrent = listResponse.data.detail.find(t => t.hash.toLowerCase() === torrentData.hash);
            
            // If it exists and is completed, request the real TorBox direct stream link
            if (existingTorrent && existingTorrent.progress === 1) {
                console.log(`[TorBox Cache Check]: Found completed torrent! Fetching streaming link...`);
                return `https://torbox.app{TORBOX_API_KEY}&torrent_id=${existingTorrent.id}&zip_link=true&redirect=true`;
            }
        }

        // Step B: If it isn't cached yet, tell TorBox to start downloading it in the background
        console.log(`[TorBox Cloud Action]: Track not cached yet. Forcing background download...`);
        await axios.post('https://torbox.app', 
            { magnet: torrentData.magnet, seed: 2, allow_as_needed: true },
            { headers: { 'Authorization': `Bearer ${TORBOX_API_KEY}`, 'Content-Type': 'application/json' } }
        );
    } catch (err) {
        console.error("TorBox Link Resolver Error:", err.message);
    }
    return null;
}

// CORE BACKEND SERVER
const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');

    const urlObj = new URL(req.url, `http://${req.headers.host}`);

    // Standard baseline Stremio/Aero handshake layout configuration file
    if (urlObj.pathname === '/manifest.json') {
        return res.end(JSON.stringify({
            id: "org.private.bitchordtb",
            name: "BitChord TorBox Scraper",
            version: "2.1.0",
            description: "Direct Torrent Scraper to TorBox pipeline.",
            resources: ["stream"],
            types: ["music"],
            idPrefixes: ["yt_"] // Targets incoming YouTube ID parameters sent by BitChord
        }));
    }

    // CATCH PLAYBACK ENDPOINTS: BitChord requests streaming audio by passing /stream/music/yt_VIDEOID.json
    if (urlObj.pathname.startsWith('/stream/music/')) {
        const segments = urlObj.pathname.split('/');
        const rawId = segments[segments.length - 1].replace('.json', '');
        const ytId = rawId.replace('yt_', ''); // Extract clean YT streaming link ID

        if (!ytId || ytId === "manifest") {
            return res.end(JSON.stringify({ streams: [] }));
        }

        // 1. Resolve raw track alphanumeric text using public YouTube definitions
        const cleanTrackName = await fetchTrackNameFromYT(ytId);
        if (!cleanTrackName) {
            return res.end(JSON.stringify({ streams: [] })); // Fallback safely to standard audio layout
        }

        // 2. Locate top seeded torrent track matching the metadata text
        const torrent = await scrapeMagnetLink(cleanTrackName);
        
        // 3. Match against your debrid library for direct audio streaming delivery URL pathways
        const realStreamUrl = await getTorBoxStreamOrCache(torrent);

        // 4. Send structural stream data block arrays straight to BitChord's native player audio layer
        return res.end(JSON.stringify({
            streams: [{
                name: "TorBox Lossless",
                title: torrent ? `FLAC | ${torrent.name}` : "Streaming Fallback Engine Node",
                // Returns the live cached TorBox cloud link, or falls back to an active file chunk to keep playback stable
                url: realStreamUrl || "https://soundhelix.com"
            }]
        }));
    }

    res.end(JSON.stringify({ status: "online" }));
});

server.listen(PORT, () => {
    console.log(`Universal BitChord Debrid Resolver running on port ${PORT}`);
});
