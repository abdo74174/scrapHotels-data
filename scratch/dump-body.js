import { newBrowser, dismissConsent } from '../services/common/browser.js';
import fs from 'fs';

async function test() {
    const browser = await newBrowser();
    try {
        const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 1000 } });
        const page = await ctx.newPage();

        const url = "https://www.hotels.com/ho234548/four-seasons-hotel-cairo-at-nile-plaza-cairo-egypt/?locale=en_GB&siteid=310000033";
        await page.goto(url, { waitUntil: 'load', timeout: 90000 });
        await page.waitForTimeout(5000);
        await dismissConsent(page);

        // Click anything resembling reviews manually
        const btn = page.locator('button', { hasText: /reviews/i }).first();
        if (await btn.isVisible()) {
            await btn.click({force: true});
            await page.waitForTimeout(5000);
        }

        const btn2 = page.locator('button', { hasText: /See all \d+ reviews/i }).first();
        if (await btn2.isVisible()) {
            await btn2.click({force: true});
            await page.waitForTimeout(6000);
        }

        const text = await page.evaluate(() => document.body.innerText);
        fs.writeFileSync('scratch/body.txt', text);
        console.log(`Saved text of length ${text.length}`);
    } finally {
        await browser.close();
    }
}
test();
