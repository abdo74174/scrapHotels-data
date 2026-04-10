import { scrapeBooking } from './booking/scraper.js';
import { scrapeAgoda } from './agoda/scraper.js';
import { scrapeTripAdvisor } from './tripadvisor/scraper.js';
import { scrapeExpedia } from './expedia/scraper.js';
import { scrapeHotels } from './hotels/scraper.js';

export const scrapers = {
    booking: scrapeBooking,
    agoda: scrapeAgoda,
    tripadvisor: scrapeTripAdvisor,
    expedia: scrapeExpedia,
    hotels: scrapeHotels
};

export async function runScraper(siteKey, socket, dateFrom, dateTo, hotelUrl, defaultUrls) {
    const scraper = scrapers[siteKey];
    if (!scraper) throw new Error(`Unknown site: ${siteKey}`);
    
    // Standardize: every scraper now accepts (socket, dateFrom, dateTo, hotelUrl, defaultUrls)
    return scraper(socket, dateFrom, dateTo, hotelUrl, defaultUrls);
}
