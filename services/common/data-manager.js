import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeUrl } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const URLS_FILE = path.join(DATA_DIR, 'hotel_urls.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const SITE_CONFIGS = {
    booking: { name: 'Booking.com' },
    agoda: { name: 'Agoda.com' },
    expedia: { name: 'Expedia.com' },
    hotels: { name: 'Hotels.com' },
    tripadvisor: { name: 'Tripadvisor.com' },
};

export function getHotelDir(hotelName) {
    if (!hotelName) return DATA_DIR;
    const hotelDir = path.join(DATA_DIR, hotelName.replace(/[^a-z0-9]/gi, '_').toLowerCase());
    if (!fs.existsSync(hotelDir)) fs.mkdirSync(hotelDir, { recursive: true });
    return hotelDir;
}

export function loadHotelUrls() {
    try {
        if (fs.existsSync(URLS_FILE)) {
            return JSON.parse(fs.readFileSync(URLS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading hotel_urls.json:', e.message);
    }
    return {};
}

export function loadState(hotelName) {
    const dir = getHotelDir(hotelName);
    const stateFile = path.join(dir, 'scrape_state.json');
    try { if (fs.existsSync(stateFile)) return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { }
    return {};
}

export function saveState(hotelName, state) {
    const dir = getHotelDir(hotelName);
    const stateFile = path.join(dir, 'scrape_state.json');
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

export function updateSiteState(hotelName, siteKey, lastReviewDate, total) {
    const state = loadState(hotelName);
    state[siteKey] = {
        siteName: SITE_CONFIGS[siteKey].name,
        lastScrapedAt: new Date().toISOString(),
        lastReviewDate: lastReviewDate || '',
        totalReviews: total,
    };
    saveState(hotelName, state);
    return state;
}

export function loadReviews(hotelName, siteKey) {
    const dir = getHotelDir(hotelName);
    const outputFile = path.join(dir, `reviews_${siteKey}.json`);
    try { if (fs.existsSync(outputFile)) return JSON.parse(fs.readFileSync(outputFile, 'utf8')); } catch { }
    return [];
}

export function saveReviews(hotelName, siteKey, reviews) {
    const dir = getHotelDir(hotelName);
    const outputFile = path.join(dir, `reviews_${siteKey}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(reviews, null, 2));
}
