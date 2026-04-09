import { chromium } from 'playwright';

async function debugBooking() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Using a known hotel URL
    const url = 'https://www.booking.com/reviewlist.html?cc1=eg&pagename=four-seasons-cairo-at-nile-plaza&sort=f_recent_desc&offset=0&rows=10&lang=en-gb';
    
    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    
    const debugData = await page.evaluate(() => {
        const firstCard = document.querySelector('.review_list_new_item_block, .c-review-block, .review_item');
        if (!firstCard) return 'NO CARD FOUND';
        
        return {
            html: firstCard.outerHTML,
            selectors: {
                positiveText: !!firstCard.querySelector('.c-review__body--positive'),
                negativeText: !!firstCard.querySelector('.c-review__body--negative'),
                roomInfo: !!firstCard.querySelector('.c-review-block__room-info')
            }
        };
    });
    
    console.log('DEBUG DATA:', JSON.stringify(debugData, null, 2));
    await browser.close();
}

debugBooking();
