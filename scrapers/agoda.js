import { scrapeAgoda } from '../services/agoda/scraper.js';
import { loadHotelUrls } from '../services/common/data-manager.js';

export async function run(hotelUrl, options = {}) {
    const urls = loadHotelUrls();
    return scrapeAgoda(null, options.dateFrom, options.dateTo, hotelUrl, urls);
}

if (process.argv[1].endsWith('agoda.js')) {
    run().then(res => console.log(`Finished. Scraped ${res.length} reviews.`));
}
