
import { scrapeHotels } from '../services/hotels/scraper.js';
import { loadHotelUrls } from '../services/common/data-manager.js';

async function test() {
    const urls = loadHotelUrls();
    const hotelName = "Four Seasons Cairo";
    const hotelUrl = urls[hotelName].hotels;
    
    console.log(`Testing Hotels.com for: ${hotelName}`);
    console.log(`URL: ${hotelUrl}`);

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

test();
