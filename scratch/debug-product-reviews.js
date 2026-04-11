import { newBrowser, dismissConsent } from '../services/common/browser.js';
import fs from 'fs';

async function test() {
    const browser = await newBrowser();
    try {
        const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 1000 } });
        const page = await ctx.newPage();

        let graphqls = [];
        page.on('response', async (res) => {
            if(res.url().includes('graphql')) {
                try {
                    const json = await res.json();
                    graphqls.push(JSON.stringify(json));
                } catch(e){}
            }
        });

        // Use product-reviews !
        const url = "https://www.hotels.com/ho234548/four-seasons-hotel-cairo-at-nile-plaza-cairo-egypt/?locale=en_GB&siteid=310000033&pwaDialog=product-reviews";
        await page.goto(url, { waitUntil: 'load', timeout: 90000 });
        await page.waitForTimeout(10000); // Give plenty of time to load the reviews modal internally
        await dismissConsent(page);

        fs.writeFileSync('scratch/product-reviews.json', graphqls.join('\n\n'));

        // Output some review text from DOM
        const reviewText = await page.$$eval('[itemprop="review"], [data-stid="reviews-list"] li, div[class*="review-"], [data-stid="property-review-item"]', arr => arr.map(e => e.innerText).join('\n---\n'));
        console.log(`DOM reviews found: ${reviewText.substring(0, 500)}`);
    } finally {
        await browser.close();
    }
}
test();
