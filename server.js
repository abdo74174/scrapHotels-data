import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import fs from 'node:fs';

import { 
    SITE_CONFIGS, 
    loadHotelUrls, 
    loadState, 
    updateSiteState, 
    loadReviews, 
    saveReviews 
} from './services/common/data-manager.js';
import { normalizeUrl } from './services/common/utils.js';
import { runScraper } from './services/index.js';

const app = express();
const server = createServer(app);
const io = new Server(server);
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

// API Routes
app.get('/api/hotels', (req, res) => {
    const hotels = loadHotelUrls();
    console.log(`🏨 [API] Loading ${Object.keys(hotels).length} hotels for dashboard`);
    res.json(hotels);
});

app.post('/api/hotels/update', (req, res) => {
    const { hotelName, urls } = req.body;
    if (!hotelName || !urls) return res.status(400).json({ error: 'Missing hotelName or urls' });

    const allUrls = loadHotelUrls();
    allUrls[hotelName] = urls;

    try {
        fs.writeFileSync('./data/hotel_urls.json', JSON.stringify(allUrls, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save URLs' });
    }
});

app.get('/api/state', (req, res) => res.json(loadState(req.query.hotel)));

app.get('/api/reviews/:site', (req, res) => {
    const { site } = req.params;
    const { hotel } = req.query;
    if (!SITE_CONFIGS[site]) return res.status(404).json({ error: 'Unknown site' });
    res.json(loadReviews(hotel, site));
});

app.get('/api/all-reviews', (req, res) => {
    const { hotel } = req.query;
    const all = [];
    for (const k of Object.keys(SITE_CONFIGS)) {
        all.push(...loadReviews(hotel, k));
    }
    res.json(all);
});

// Socket.io Real-time communication
io.on('connection', (socket) => {
    console.log('🔌 Client connected');
    
    socket.on('get_state', ({ hotelName }) => {
        socket.emit('scrape_state', loadState(hotelName));
    });

    socket.on('start_scrape', async ({ hotelName, sites, mode, dateFrom, dateTo }) => {
        if (!hotelName) return socket.emit('site_status', { msg: '❌ Error: No hotel selected' });
        
        const allUrls = loadHotelUrls();
        const hotelUrls = allUrls[hotelName];
        if (!hotelUrls) return socket.emit('site_status', { msg: `❌ Error: Hotel "${hotelName}" not found` });

        const selected = sites?.length ? sites : Object.keys(SITE_CONFIGS);
        const state = loadState(hotelName);

        for (const siteKey of selected) {
            socket.emit('site_progress', { site: siteKey, status: 'running' });

            let effectiveDateFrom = dateFrom;
            let effectiveDateTo = dateTo;

            if (mode === 'all') {
                effectiveDateFrom = null; 
                effectiveDateTo = null;
            } else if (mode === 'new') {
                if (state[siteKey]?.lastScrapedAt) {
                    effectiveDateFrom = state[siteKey].lastScrapedAt.split('T')[0];
                }
            }

            let hotelUrl = normalizeUrl(hotelUrls[siteKey]);

            try {
                const newReviews = await runScraper(siteKey, socket, effectiveDateFrom, effectiveDateTo, hotelUrl);
                const existing = loadReviews(hotelName, siteKey);

                // Helper to create a unique fingerprint for a review
                const getFprint = (r) => `${r.reviewerName}|${r.date}|${r.title}|${(r.reviewText || '').slice(0, 150)}`.toLowerCase().replace(/\s+/g, '');

                const keySet = new Set(existing.map(getFprint));
                const unique = newReviews.filter(r => {
                    const fp = getFprint(r);
                    if (keySet.has(fp)) return false;
                    keySet.add(fp);
                    return true;
                });

                const merged = [...existing, ...unique];
                saveReviews(hotelName, siteKey, merged);

                let lastReviewDate = state[siteKey]?.lastReviewDate || '';
                for (const r of unique) {
                    if (r.date && r.date > lastReviewDate) lastReviewDate = r.date;
                }

                const newState = updateSiteState(hotelName, siteKey, lastReviewDate, merged.length);
                socket.emit('scrape_state', newState);
                socket.emit('site_status', { site: siteKey, msg: `✅ Done! ${unique.length} new reviews.` });
                socket.emit('site_progress', { site: siteKey, status: 'done', count: merged.length, newCount: unique.length });
            } catch (err) {
                console.error(`[${siteKey}] Error:`, err.message);
                socket.emit('site_status', { site: siteKey, msg: `❌ Error: ${err.message}` });
                socket.emit('site_progress', { site: siteKey, status: 'error' });
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`🏨  Hotel Review Scraper — http://localhost:${PORT}`);
    console.log(`📂  Data saved to memory and local files`);

    // One-time startup cleanup logic for all hotels
    const allUrls = loadHotelUrls();
    Object.keys(allUrls).forEach(hotelName => {
        Object.keys(SITE_CONFIGS).forEach(siteKey => {
            const reviews = loadReviews(hotelName, siteKey);
            if (reviews.length > 0) {
                const getFprint = (r) => `${r.reviewerName}|${r.date}|${r.title}|${(r.reviewText || '').slice(0, 150)}`.toLowerCase().replace(/\s+/g, '');
                const seen = new Set();
                const clean = reviews.filter(r => {
                    const fp = getFprint(r);
                    if (seen.has(fp)) return false;
                    seen.add(fp);
                    return true;
                });
                if (clean.length !== reviews.length) {
                    console.log(`[cleanup][${hotelName}] Removed ${reviews.length - clean.length} duplicates from ${SITE_CONFIGS[siteKey].name}`);
                    saveReviews(hotelName, siteKey, clean);
                }
            }
        });
    });
});
