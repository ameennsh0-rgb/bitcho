const http = require('http');
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const TORBOX_API_KEY = process.env.TORBOX_API_KEY;

// 1. PUBLIC METADATA ENGINE (LRCLIB API)
async function fetchMusicMetadata(trackQuery) {
    try {
        const response = await axios.get(`https://lrclib.net{encodeURIComponent(trackQuery)}`, { timeout: 3000 });
        if (response.data && response.data.length > 0) {
            const track = response.data[0]; // Safely grab top item
            return { 
                title: track.trackName, 
                artist: track.artistName, 
                album: track.albumName, 
                duration: Math.round(track.duration || 180), 
                lyrics: track.syncedLyrics || "" 
            };
        }
    } catch (err) { 
        console.error("Meta Fetch Fail:", err.message); 
    }
    return { title: trackQuery, artist: "Unknown Artist", album: "Single", duration: 180, lyrics: "" };
}

// 2. TORRENT MAGNET SCRAPER
async function scrapeMagnetLink(searchQuery) {
    try {
        console.log(`[Scraper] Searching torrent trackers for: "${searchQuery}"`);
        const encodedQuery = encodeURIComponent(searchQuery + " flac"); 
        const response = await axios.get(`https://apibay.org{encodedQuery}`, { timeout: 4500 });
        
        if (response.data && response.data.length > 0 && response.data.info_hash !== "0") {
            const topTorrent = response.data[0]; // Safely grab top array item
            return {
                hash: topTorrent.info_hash.toLowerCase(),
                magnet: `magnet:?xt=urn:btih:${topTorrent.info_hash}&dn=${encodeURIComponent(topTorrent.name)}`,
                name: topTorrent.name
            };
        }
        return null;
    } catch (err) { 
        console.error("Scraper Fail:", err.message); 
        return null; 
    }
}

// 3. TORBOX CHECK & INSTANT STREAM RESOLVER
async function getTorBoxStreamOrCache(torrentData) {
    if (!torrentData) {
        return null;
    }
    try {
        // Step A: Check if this torrent hash is already cached/downloaded in your TorBox cloud
        const listResponse = await axios.get('https://torbox.app', {
            headers: { 'Authorization': `Bearer ${TORBOX_API_KEY}` }
        });

        if (listResponse.data && listResponse.data.success) {
            const existingTorrent = listResponse.data.detail.find(function(t) {
                return t.hash.toLowerCase() === torrentData.hash;
            });
            
            // If it exists and is 100% completed, request the real TorBox direct stream link
            if (existingTorrent && existingTorrent.progress === 1) {
                console.log(`[TorBox] Found cached copy! Fetching direct download stream link...`);
                // Standard TorBox Permalink format to keep links fresh
                return `https://torbox.app{TORBOX_API_KEY}&torrent_id=${existingTorrent.id}&zip_link=true&redirect=true`;
            }
        }

        // Step B: If it isn't cached yet, tell TorBox to start caching it in the background
        console.log(`[TorBox] Track not cached yet. Forcing background cache download...`);
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

    if (urlObj.pathname === '/manifest.json') {
        return res.end(JSON.stringify({
            id: "org.private.bitchordtb",
            name: "BitChord TorBox Scraper",
            version: "2.0.0",
            description: "Direct Torrent Scraper to TorBox pipeline.",
            resources: ["stream", "catalog", "search"],
            types: ["music"],
            catalogs: [{ type: "music", id: "tb_music_search", name: "TorBox Search", extra: [{ name: "search", required: true }] }],
            idPrefixes: ["yt_", "tb_"]
        }));
    }

    if (urlObj.pathname.includes('/stream/') || urlObj.pathname.includes('/catalog/') || urlObj.search.includes('search=')) {
        let rawQuery = "";
        if (urlObj.searchParams.has('search')) { 
            rawQuery = urlObj.searchParams.get('search'); 
        } else { 
            const segments = urlObj.pathname.split('/'); 
            rawQuery = segments[segments.length - 1].replace('.json', ''); 
        }

        const cleanTrackName = decodeURIComponent(rawQuery).replace('yt_', '').replace('tb_', '').replace(/_/g, ' ').trim();
        if (!cleanTrackName || cleanTrackName === "manifest") { 
            return res.end(JSON.stringify({ metas: [], streams: [] })); 
        }

        // 1. Pull exact metadata & lyrics
        const metaData = await fetchMusicMetadata(cleanTrackName);

        // 2. Locate the torrent magnet hash
        const torrent = await scrapeMagnetLink(`${metaData.artist} ${metaData.title}`);
        
        // 3. Match against TorBox for an instant direct stream link
        const realStreamUrl = await getTorBoxStreamOrCache(torrent);

        // 4. Return the structure BitChord requires to populate items
        return res.end(JSON.stringify({
            metas: [{
                id: `tb_${encodeURIComponent(cleanTrackName)}`,
                type: "music",
                name: metaData.title,
                artist: metaData.artist,
                album: metaData.album,
                duration: metaData.duration,
                lyrics: metaData.lyrics,
                description: realStreamUrl ? `✅ Instant Stream Available` : `⏳ Caching to TorBox cloud drive... Try again in 20s.`
            }],
            streams: [{
                name: "TorBox Debrid Audio",
                title: torrent ? `FLAC | ${torrent.name}` : "Search Node Processing",
                // Provide a legal fallback sample mp3 link so BitChord never registers an error or 404
                url: realStreamUrl || "https://soundhelix.com"
            }]
        }));
    }
    res.end(JSON.stringify({ status: "online" }));
});

server.listen(PORT, () => { 
    console.log(`Aero-Spec Script running on port ${PORT}`); 
});
