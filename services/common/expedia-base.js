import { newBrowser, dismissConsent } from './browser.js';
import { inRange } from './utils.js';

export async function scrapeExpediaLike(siteKey, siteName, socket, dateFrom, dateTo, hotelUrl, selectors, parserFunc) {
    const reviews = [];
    const browser = await newBrowser();
    try {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();

        const cleanUrl = hotelUrl.split('?')[0];
        socket.emit('site_status', { site: siteKey, msg: `Opening ${siteName}...` });
        await page.goto(cleanUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);
        await dismissConsent(page);

        try {
            const reviewsBtn = page.locator('button:has-text("See all reviews"), a:has-text("See all reviews")').first();
            if (await reviewsBtn.isVisible({ timeout: 5000 })) {
                await reviewsBtn.click();
                await page.waitForTimeout(3000);
            }
        } catch { }

        let pageNum = 1;
        let stop = false;

        while (!stop && pageNum <= 500) {
            socket.emit('site_status', { site: siteKey, msg: `Page ${pageNum} — ${reviews.length} reviews...` });
            await page.waitForTimeout(2000);

            const rawCards = await parserFunc(page, selectors);

            if (rawCards.length === 0) break;

            for (const r of rawCards) {
                const chk = inRange(r.date, dateFrom, dateTo);
                if (chk === 'before') { stop = true; break; }
                if (chk === 'after') continue;
                reviews.push({ site: siteName, ...r, scrapedAt: new Date().toISOString() });
                socket.emit('new_review', { site: siteKey, review: reviews[reviews.length - 1] });
            }

            if (stop) break;

            const nextBtn = page.locator(selectors.NEXT_BUTTON.join(', ')).first();
            if (await nextBtn.isVisible({ timeout: 5000 })) {
                await nextBtn.click({ force: true });
                await page.waitForTimeout(4000);
                pageNum++;
            } else break;
        }
    } finally {
        await browser.close();
    }
    return reviews;
}
