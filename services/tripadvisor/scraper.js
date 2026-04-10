import { newBrowser, dismissConsent } from '../common/browser.js';
import { inRange } from '../common/utils.js';
import { SELECTORS } from './constants.js';
import { parseTripAdvisorPage } from './utils/parser.js';

export async function scrapeTripAdvisor(socket, dateFrom, dateTo, hotelUrl, defaultUrls) {
    const reviews = [];
    const browser = await newBrowser();
    try {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        
        const url = hotelUrl || (defaultUrls && defaultUrls.tripadvisor) || '';
        if (!url) throw new Error('No hotel URL provided for TripAdvisor');

        if (socket) socket.emit('site_status', { site: 'tripadvisor', msg: 'Opening TripAdvisor...' });
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);
        await dismissConsent(page);

        let pageNum = 1;
        let stop = false;

        while (!stop && pageNum <= 500) {
            if (socket) socket.emit('site_status', { site: 'tripadvisor', msg: `Page ${pageNum} — ${reviews.length} reviews...` });
            
            await page.waitForSelector(SELECTORS.CARDS.join(', '), { timeout: 10000 }).catch(() => null);
            const rawCards = await parseTripAdvisorPage(page, SELECTORS);

            if (rawCards.length === 0) break;

            for (const r of rawCards) {
                const chk = inRange(r.date, dateFrom, dateTo);
                if (chk === 'before') { stop = true; break; }
                if (chk === 'after') continue;

                const reviewEntry = { 
                    site: 'Tripadvisor.com', 
                    ...r, 
                    scrapedAt: new Date().toISOString() 
                };
                reviews.push(reviewEntry);
                if (socket) socket.emit('new_review', { site: 'tripadvisor', review: reviewEntry });
            }

            if (stop) break;

            const nextBtn = page.locator(SELECTORS.NEXT_BUTTON.join(', ')).first();
            if (await nextBtn.isVisible({ timeout: 5000 })) {
                await nextBtn.click();
                await page.waitForTimeout(3000);
                pageNum++;
            } else break;
        }
    } finally {
        await browser.close();
    }
    return reviews;
}
