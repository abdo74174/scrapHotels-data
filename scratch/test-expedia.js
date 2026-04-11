import { scrapeExpediaLike } from '../services/common/expedia-base.js';
import { loadHotelUrls } from '../services/common/data-manager.js';

async function testExpedia() {
    const urls = loadHotelUrls();
    const mockSocket = { emit: (e, d) => console.log(`[${e}]`, d) };
    const hotelUrl = urls['Four Seasons Cairo'].expedia;
    console.log(`Testing Expedia for URL: ${hotelUrl}`);
    const results = await scrapeExpediaLike('expedia', 'Expedia.com', mockSocket, null, null, hotelUrl);
    console.log(`Finished Expedia with ${results.length} reviews`);
}

testExpedia();
