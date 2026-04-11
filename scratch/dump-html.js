import { newBrowser, dismissConsent } from '../services/common/browser.js';
import fs from 'fs';

async function test() {
    const browser = await newBrowser();
    try {
        const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 1000 } });
        const page = await ctx.newPage();

        const url = "https://www.hotels.com/ho234548/four-seasons-hotel-cairo-at-nile-plaza-cairo-egypt/?locale=en_GB&siteid=310000033&pwaDialog=reviews-property-reviews-wrapper-1";
        await page.goto(url, { waitUntil: 'load', timeout: 90000 });
        await page.waitForTimeout(5000);
        await dismissConsent(page);

        // Click review button
        const btnsCount = await page.locator('button:has-text("See all ")').count();
        if (btnsCount > 0) {
            await page.locator('button:has-text("See all ")').first().click();
            await page.waitForTimeout(5000);
        }

        const html = await page.content();
        fs.writeFileSync('scratch/dump.html', html);
        
        console.log(`HTML size: ${html.length}`);
    } finally {
        await browser.close();
    }
}
test();
