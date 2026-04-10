import { newBrowser, dismissConsent } from '../common/browser.js';
import { inRange } from '../common/utils.js';
import { SELECTORS } from './constants.js';
import { parseAgodaPage } from './utils/parser.js';

export async function scrapeAgoda(socket, dateFrom, dateTo, hotelUrl, defaultUrls) {
    const reviews = [];
    const browser = await newBrowser();
    try {
        const ctx = await browser.newContext({
            locale: 'en-US',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
        });
        const page = await ctx.newPage();
        await page.goto(hotelUrl || defaultUrls.agoda, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);
        await dismissConsent(page);

        let pageNum = 1;
        let stop = false;

        while (!stop && pageNum <= 500) {
            socket.emit('site_status', { site: 'agoda', msg: `Page ${pageNum} — ${reviews.length} reviews...` });
            await page.waitForTimeout(2000);

            const rawCards = await parseAgodaPage(page, SELECTORS);

            if (rawCards.length === 0) break;

            for (const r of rawCards) {
                const chk = inRange(r.date, dateFrom, dateTo);
                if (chk === 'before') { stop = true; break; }
                if (chk === 'after') continue;
                reviews.push({ site: 'Agoda.com', ...r, scrapedAt: new Date().toISOString() });
                socket.emit('new_review', { site: 'agoda', review: reviews[reviews.length - 1] });
            }

            if (stop) break;

            const nextBtn = page.locator(SELECTORS.NEXT_BUTTON.join(', ')).first();
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
