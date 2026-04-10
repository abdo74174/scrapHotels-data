import { scrapeExpedia } from '../services/expedia/scraper.js';
import { loadHotelUrls } from '../services/common/data-manager.js';

export async function run(hotelUrl, options = {}) {
    const urls = loadHotelUrls();
    // In wrapper context, we don't have a socket usually
    return scrapeExpedia(null, options.dateFrom, options.dateTo, hotelUrl, urls);
}

if (process.argv[1].endsWith('expedia.js')) {
    run().then(res => console.log(`Finished. Scraped ${res.length} reviews.`));
}
