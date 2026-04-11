
import { scrapeHotels } from '../services/hotels/scraper.js';

async function reproduce() {
    const hotelUrl = "https://www.hotels.com/ho234548/four-seasons-hotel-cairo-at-nile-plaza-cairo-egypt/?locale=en_GB&siteid=310000033&pwaDialog=reviews-property-reviews-wrapper-1";
    
    console.log(`Reproducing issue for: ${hotelUrl}`);

    const mockSocket = {
        emit: (event, data) => {
            if (event === 'site_status') {
                console.log(`[STATUS] ${data.msg}`);
            } else if (event === 'new_review') {
                console.log(`[NEW REVIEW] From ${data.review.reviewerName}: ${data.review.reviewText.slice(0, 50)}...`);
            }
        }
    };

    try {
        const results = await scrapeHotels(mockSocket, null, null, hotelUrl);
        console.log(`Finished. Scraped ${results.length} reviews.`);
    } catch (err) {
        console.error("Test failed:", err);
    }
}

reproduce();
