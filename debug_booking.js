import { chromium } from 'playwright';

async function debugBooking() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Using a known hotel URL
    const url = 'https://www.booking.com/reviewlist.html?cc1=eg&pagename=four-seasons-cairo-at-nile-plaza&sort=f_recent_desc&offset=0&rows=10&lang=en-gb';
    const url2 = 'https://www.booking.com/hotel/eg/four-seasons-cairo-at-nile-plaza.ar.html?aid=1610707&label=four-seasons-5QMYOvA_pYS87LFsDY7VsgS379678176194%3Apl%3Ata%3Ap1%3Ap2%3Aac%3Aap%3Aneg%3Afi%3Atikwd-370653961367%3Alp9112387%3Ali%3Adec%3Adm%3Appccp%3DUmFuZG9tSVYkc2RlIyh9YRlijhKLEMjJN0wau52YD5E&sid=f914397d5b7a2541e55eb782107afb33&all_sr_blocks=29997016_401734982_2_2_0&checkin=2026-04-25&checkout=2026-04-26&dest_id=299970&dest_type=hotel&dist=0&group_adults=2&group_children=0&hapos=1&highlighted_blocks=29997016_401734982_2_2_0&hpos=1&matching_block_id=29997016_401734982_2_2_0&no_rooms=1&req_adults=2&req_children=0&room1=A%2CA&sb_price_type=total&sr_order=popularity&sr_pri_blocks=29997016_401734982_2_2_0__47500&srepoch=1775667380&srpvid=e350771760930078&type=total&ucfs=1&';

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
