const http = require('http');
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TORBOX_API_KEY = process.env.TORBOX_API_KEY;

// 1. RESOLVE YOUTUBE ID TO CLEAN TITLE TEXT
async function fetchTrackNameFromYT(ytId) {
    try {
        console.log(`[BitChord Intercept] Resolving Video ID: ${ytId}`);
        const response = await axios.get(`https://youtube.com{ytId}&format=json`, { timeout: 3000 });
        if (response.data && response.data.title) {
            return response.data.title
                .replace(/\(Official.*?\)/gi, '')
                .replace(/\[Official.*?\]/gi, '')
                .replace(/Lyrics/gi, '')
                .trim();
        }
    } catch (err) {
        console.error("YouTube Metadata Lookup Failed:", err.message);
    }
    return null;
}

// 2. STABLE HIGH-AVAILABILITY TORRENT SCRAPER (Bypasses dead APIBay endpoints)
async function scrapeMagnetLink(searchQuery) {
    // List of reliable public mirror tracker API endpoints to try sequentially if one fails
    const mirrorEndpoints = [
        'https://tpb.party',
        'https://piratebayproxy.info',
        'https://thepiratebay0.org'
    ];

    console.log(`[Scraper] Searching active torrent mirrors for: "${searchQuery}"`);
    const encodedQuery = encodeURIComponent(searchQuery + " flac"); 

    for (const baseApi of mirrorEndpoints) {
        try {
            const targetUrl = `${baseApi}${encodedQuery}`;
            const response = await axios.get(targetUrl, { timeout: 4000 });
            
            // Check if mirror returned valid array data strings
            if (response.data && response.data.length > 0 && response.data[0].info_hash && response.data[0].info_hash !== "0") {
                const topTorrent = response.data[0];
                console.log(`[Scraper Success] Bound stream from mirror node: ${topTorrent.name}`);
                return {
                    hash: topTorrent.info_hash.toLowerCase(),
                    magnet: `magnet:?xt=urn:btih:${topTorrent.info_hash}&dn=${encodeURIComponent(topTorrent.name)}`,
                    name: topTorrent.name
                };
            }
        } catch (err) {
            console.warn(`Mirror endpoint down or timed out: ${baseApi}`);
            continue; // Failover silently to the next backup tracker mirror in the array
        }
    }
    return null;
}

// 3. CHECK TORBOX FOR INSTANT LINK OR COMMAND BACKGROUND CACHING
async function getTorBoxStreamOrCache(torrentData) {
    if (!torrentData) return null;
    try {
        // Step A: Check if it's already downloaded/cached inside your TorBox cloud drive
        const listResponse = await axios.get('https://torbox.app', {
            headers: { 'Authorization': `Bearer ${TORBOX_API_KEY}` }
        });

        if (listResponse.data && listResponse.data.success) {
            const existingTorrent = listResponse.data.detail.find(t => t.hash.toLowerCase() === torrentData.hash);
            
            // If completed, get the high-speed download link straight from your debrid cloud account
            if (existingTorrent && existingTorrent.progress === 1) {
                console.log(`[TorBox Cache Check]: Torrent Completed! Fetching stream link...`);
                const linkResponse = await axios.get(`https://torbox.app{TORBOX_API_KEY}&torrent_id=${existingTorrent.id}`);
                if (linkResponse.data && linkResponse.data.success) {
                    return linkResponse.data.detail; 
                }
            }
        }

        // Step B: If not cached yet, force TorBox to start caching it in the background
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

// BITCHORD NATIVE ENDPOINT MANAGER
const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');

    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    
    // Accept queries under root format structure as triggered by BitChord app layout controllers
    const ytId = urlObj.searchParams.get('id') || urlObj.searchParams.get('video_id');

    if (ytId) {
        const cleanTrackName = await fetchTrackNameFromYT(ytId);
        if (!cleanTrackName) {
            return res.end(JSON.stringify({ url: null }));
        }

        const torrent = await scrapeMagnetLink(cleanTrackName);
        const realStreamUrl = await getTorBoxStreamOrCache(torrent);

        if (realStreamUrl) {
            return res.end(JSON.stringify({
                url: realStreamUrl,
                quality: "Hi-Res FLAC",
                source: "TorBox Debrid Cloud"
            }));
        } else {
            // Caching notice backup placeholder audio stream to keep media elements operational
            return res.end(JSON.stringify({
                url: "https://soundhelix.com",
                quality: "Buffering/Caching Queue",
                source: "TorBox"
            }));
        }
    }

    return res.end(JSON.stringify({ status: "online", msg: "BitChord TorBox Scraper Operational" }));
});

server.listen(PORT, () => {
    console.log(`BitChord Multi-Mirror Resolver active on port ${PORT}`);
});
const http = require('http');
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TORBOX_API_KEY = process.env.TORBOX_API_KEY;

// 1. RESOLVE YOUTUBE ID TO CLEAN TITLE TEXT
async function fetchTrackNameFromYT(ytId) {
    try {
        console.log(`[BitChord Intercept] Resolving Video ID: ${ytId}`);
        const response = await axios.get(`https://youtube.com{ytId}&format=json`, { timeout: 3000 });
        if (response.data && response.data.title) {
            return response.data.title
                .replace(/\(Official.*?\)/gi, '')
                .replace(/\[Official.*?\]/gi, '')
                .replace(/Lyrics/gi, '')
                .trim();
        }
    } catch (err) {
        console.error("YouTube Metadata Lookup Failed:", err.message);
    }
    return null;
}

// 2. SCRAPE PUBLIC TRAKERS FOR MAGNET
async function scrapeMagnetLink(searchQuery) {
    try {
        console.log(`[Scraper] Searching trackers for: "${searchQuery}"`);
        const encodedQuery = encodeURIComponent(searchQuery + " flac"); 
        const response = await axios.get(`https://apibay.org{encodedQuery}`, { timeout: 4500 });
        
        if (response.data && response.data.length > 0 && response.data.info_hash !== "0") {
            const topTorrent = response.data;
            return {
                hash: topTorrent.info_hash.toLowerCase(),
                magnet: `magnet:?xt=urn:btih:${topTorrent.info_hash}&dn=${encodeURIComponent(topTorrent.name)}`,
                name: topTorrent.name
            };
        }
        return null;
    } catch (err) {
        console.error("Scraper Failure:", err.message);
        return null;
    }
}

// 3. CHECK TORBOX FOR INSTANT LINK OR COMMAND BACKWARD CACHING
async function getTorBoxStreamOrCache(torrentData) {
    if (!torrentData) return null;
    try {
        // Step A: Check if it's already downloaded/cached inside your TorBox cloud
        const listResponse = await axios.get('https://torbox.app', {
            headers: { 'Authorization': `Bearer ${TORBOX_API_KEY}` }
        });

        if (listResponse.data && listResponse.data.success) {
            const existingTorrent = listResponse.data.detail.find(t => t.hash.toLowerCase() === torrentData.hash);
            
            // If completed, get the high-speed download url straight from your debrid cloud account
            if (existingTorrent && existingTorrent.progress === 1) {
                console.log(`[TorBox Cache Check]: Torrent Completed! Fetching stream link...`);
                
                const linkResponse = await axios.get(`https://torbox.app{TORBOX_API_KEY}&torrent_id=${existingTorrent.id}`);
                if (linkResponse.data && linkResponse.data.success) {
                    return linkResponse.data.detail; // Real direct stream link
                }
            }
        }

        // Step B: If not cached yet, force TorBox to cache download it in the background
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

// BITCHORD NATIVE ENDPOINT MANAGER
const server = http.createServer(async (req, res) => {
    // Provide generic header allowances to satisfy native Android requests
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');

    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    console.log(`[App Connection]: Path called -> ${urlObj.pathname}${urlObj.search}`);

    // Capture standard path queries initiated by BitChord's player engine
    // Format incoming: /?id=YOUTUBE_VIDEO_ID or /stream?id=YOUTUBE_VIDEO_ID
    const ytId = urlObj.searchParams.get('id') || urlObj.searchParams.get('video_id');

    if (ytId) {
        const cleanTrackName = await fetchTrackNameFromYT(ytId);
        if (!cleanTrackName) {
            // Return a null JSON block so BitChord silently drops to default YouTube engine
            return res.end(JSON.stringify({ url: null }));
        }

        const torrent = await scrapeMagnetLink(cleanTrackName);
        const realStreamUrl = await getTorBoxStreamOrCache(torrent);

        // NATIVE BITCHORD DIRECT FORMAT: The app expects a single root-level object containing a "url" property
        if (realStreamUrl) {
            return res.end(JSON.stringify({
                url: realStreamUrl,
                quality: "Hi-Res FLAC",
                source: "TorBox Debrid Cloud"
            }));
        } else {
            // If it's still caching, give a temporary working stream chunk so it doesn't display playback errors
            return res.end(JSON.stringify({
                url: "https://soundhelix.com",
                quality: "Buffering/Caching Queue",
                source: "TorBox"
            }));
        }
    }

    // Baseline root path status return to satisfy connections 
    return res.end(JSON.stringify({ status: "online", instructions: "Input your server URL inside BitChord settings" }));
});

server.listen(PORT, () => {
    console.log(`BitChord Native Audio Resolver active on port ${PORT}`);
});
