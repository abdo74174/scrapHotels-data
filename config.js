import path from 'path';
import fs from 'fs';

const DATA_DIR = './data';
const URLS_FILE = path.join(DATA_DIR, 'hotel_urls.json');

function loadHotelUrls() {
    try {
        if (fs.existsSync(URLS_FILE)) {
            return JSON.parse(fs.readFileSync(URLS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading hotel_urls.json:', e.message);
    }
    return {};
}

const hotelUrls = loadHotelUrls();

export const config = {
    dataDir: DATA_DIR,
    urls: hotelUrls,
    outputs: {
        booking: path.join(DATA_DIR, 'reviews_booking.json'),
        agoda: path.join(DATA_DIR, 'reviews_agoda.json'),
        expedia: path.join(DATA_DIR, 'reviews_expedia.json'),
        hotels: path.join(DATA_DIR, 'reviews_hotels.json'),
        tripadvisor: path.join(DATA_DIR, 'reviews_tripadvisor.json'),
        merged: path.join(DATA_DIR, 'all_reviews.json')
    },
    options: {
        delayMin: 2000,
        delayMax: 5000,
        maxPages: 100
    }
};

export const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
];

export const randomDelay = () => new Promise(res => setTimeout(res, Math.floor(Math.random() * (config.options.delayMax - config.options.delayMin + 1)) + config.options.delayMin));
