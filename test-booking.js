import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    console.log('Testing old hotelId method...');
    // hotelId for Four Seasons Cairo is 142129
    await page.goto('https://www.booking.com/reviewlist.html?hotel_id=142129&sort=f_recent_desc&offset=0&rows=25&lang=en-gb', { waitUntil: 'domcontentloaded' });
    let cards = await page.$$('[data-testid="review-card"], .c-review-block, .review_item');
    console.log(`Cards with hotel_id: ${cards.length}`);
    
    console.log('Testing cc1 + pagename method...');
    await page.goto('https://www.booking.com/reviewlist.html?cc1=eg&pagename=four-seasons-cairo-at-nile-plaza&sort=f_recent_desc&offset=25&rows=25&lang=en-gb', { waitUntil: 'domcontentloaded' });
    cards = await page.$$('[data-testid="review-card"], .c-review-block, .review_list_new_item_block, .review_item');
    console.log(`Cards with pagename: ${cards.length}`);

    await browser.close();
})();
