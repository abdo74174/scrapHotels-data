import { scrapeAgoda } from '../services/agoda/scraper.js';
import { loadHotelUrls, saveReviews, loadReviews, updateSiteState } from '../services/common/data-manager.js';

export async function run(hotelUrl, options = {}) {
    const urls = loadHotelUrls();
    // Use provided URL, or fallback to Four Seasons Cairo's Agoda URL, or first hotel in list
    const targetUrl = hotelUrl || (urls["Four Seasons Cairo"]?.agoda) || (Object.values(urls)[0]?.agoda);
    return scrapeAgoda(null, options.dateFrom, options.dateTo, targetUrl);
}

if (process.argv[1].endsWith('agoda.js')) {
    // When run directly from CLI, save results to file
    const hotelName = process.argv[2] || 'Four Seasons Cairo';
    console.log(`[CLI] Scraping Agoda for "${hotelName}"...`);

    run().then(newReviews => {
        console.log(`[CLI] Scraped ${newReviews.length} reviews.`);

        if (newReviews.length > 0) {
            // Load existing, deduplicate, save
            const existing = loadReviews(hotelName, 'agoda');
            const getFprint = (r) => `${r.reviewerName}|${r.date}|${r.title}|${(r.reviewText || '').slice(0, 150)}`.toLowerCase().replace(/\s+/g, '');
            const keySet = new Set(existing.map(getFprint));
            const unique = newReviews.filter(r => {
                const fp = getFprint(r);
                if (keySet.has(fp)) return false;
                keySet.add(fp);
                return true;
            });
            const merged = [...existing, ...unique];
            saveReviews(hotelName, 'agoda', merged);

            let lastReviewDate = '';
            for (const r of unique) {
                if (r.date && r.date > lastReviewDate) lastReviewDate = r.date;
            }
            updateSiteState(hotelName, 'agoda', lastReviewDate, merged.length);

            console.log(`[CLI] Saved ${unique.length} new reviews (${merged.length} total).`);
        } else {
            console.log('[CLI] No reviews scraped.');
        }
    }).catch(err => {
        console.error('[CLI] Error:', err);
        process.exit(1);
    });
}
