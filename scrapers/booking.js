import { scrapeBooking } from '../services/booking/scraper.js';
import { loadHotelUrls } from '../services/common/data-manager.js';

export async function run(hotelUrl, options = {}) {
    const urls = loadHotelUrls();
    return scrapeBooking(null, options.dateFrom, options.dateTo, hotelUrl, urls);
}

// Support for direct execution: node scrapers/booking.js
if (process.argv[1].endsWith('booking.js')) {
    run().then(res => console.log(`Finished. Scraped ${res.length} reviews.`));
}