import { scrapeTripAdvisor } from '../services/tripadvisor/scraper.js';
import { loadHotelUrls } from '../services/common/data-manager.js';

async function testTA() {
    const urls = loadHotelUrls();
    const mockSocket = { emit: (e, d) => console.log(`[${e}]`, d) };
    const hotelUrl = urls['Four Seasons Cairo'].tripadvisor;
    console.log(`Testing Tripadvisor for URL: ${hotelUrl}`);
    const results = await scrapeTripAdvisor(mockSocket, null, null, hotelUrl);
    console.log(`Finished Tripadvisor with ${results.length} reviews`);
}

testTA();
