import { run } from '../scrapers/booking.js';

async function testExtraction() {
    const url = 'https://www.booking.com/hotel/eg/four-seasons-cairo-at-nile-plaza.en-gb.html';
    const reviews = await run(url, { maxPages: 1 });
    console.log('EXTRACTED REVIEWS:', JSON.stringify(reviews.slice(0, 2), null, 2));
}

testExtraction().catch(console.error);
