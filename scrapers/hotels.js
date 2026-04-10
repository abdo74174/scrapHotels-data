import { scrapeHotels } from '../services/hotels/scraper.js';
import { loadHotelUrls } from '../services/common/data-manager.js';

export async function run(hotelUrl, options = {}) {
    const urls = loadHotelUrls();
    return scrapeHotels(null, options.dateFrom, options.dateTo, hotelUrl, urls);
}

if (process.argv[1].endsWith('hotels.js')) {
    run().then(res => console.log(`Finished. Scraped ${res.length} reviews.`));
}
