import { chromium } from 'playwright';
import fs from 'fs';
import { config, userAgents, randomDelay } from '../config.js';

const EMPTY_PHRASES = [
    'there are no comments available for this review',
    'no comments',
    'no comment',
    'n/a',
    'none',
];

const clean = (str) => {
    if (!str) return '';
    const t = str.trim();
    if (EMPTY_PHRASES.some(p => t.toLowerCase().includes(p))) return '';
    return t;
};

export async function run(hotelUrl, options = {}) {
    const site = 'Hotels.com';
    const reviews = [];
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: userAgents[Math.floor(Math.random() * userAgents.length)]
    });

    try {
        const page = await context.newPage();
        let url = hotelUrl || config.urls.hotels;
        url = url.split('?')[0];

        console.log(`[${site}] Starting scrape for ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);

        const seeAllBtn = page.locator('button:has-text("See all reviews"), a:has-text("See all reviews")').first();
        if (await seeAllBtn.isVisible({ timeout: 5000 })) {
            await seeAllBtn.click();
            await page.waitForTimeout(3000);
        }

        let pageNum = 1;
        let hasMore = true;

        while (hasMore && pageNum <= (options.maxPages || config.options.maxPages)) {
            console.log(`[${site}] Scraping page ${pageNum}...`);
            await page.waitForSelector('[data-stid="reviews-expand"], [itemprop="review"]', { timeout: 10000 }).catch(() => null);

            const rawCards = await page.evaluate(() => {
                const cards = document.querySelectorAll('[itemprop="review"], div[class*="ReviewItem"]');
                return Array.from(cards).map(card => {
                    const get = (...sels) => {
                        for (const s of sels) {
                            const el = card.querySelector(s);
                            if (el && el.innerText.trim()) return el.innerText.trim();
                        }
                        return '';
                    };
                    return {
                        reviewerName: get('[itemprop="author"]', '[class*="userName"]'),
                        nationality: '',
                        date: get('[itemprop="datePublished"]', 'time'),
                        rating: get('[class*="ratingNumber"]'),
                        title: get('h3', 'h4', '[class*="title"]'),
                        reviewText: get('[itemprop="description"]', 'p'),
                        positive: '',
                        negative: '',
                        roomType: '',
                        tripType: ''
                    };
                });
            });

            if (rawCards.length === 0) break;

            for (const r of rawCards) {
                const positive  = clean(r.positive);
                const negative  = clean(r.negative);
                const body      = clean(r.body);

                const reviewText = (positive || negative)
                    ? [positive, negative].filter(Boolean).join(' | ')
                    : clean(r.reviewText || r.body || '');

                reviews.push({
                    site,
                    reviewerName : r.reviewerName,
                    nationality  : r.nationality,
                    date         : r.date,
                    rating       : r.rating,
                    title        : r.title,
                    positive,
                    negative,
                    reviewText,
                    roomType     : r.roomType,
                    tripType     : r.tripType,
                    scrapedAt    : new Date().toISOString(),
                }); 
            }

            fs.writeFileSync(config.outputs.hotels, JSON.stringify(reviews, null, 2));
            console.log(`[${site}] Current total: ${reviews.length}`);

            const nextBtn = page.locator('button:has-text("Next"), [data-stid="pagination-next"]').first();
            if (await nextBtn.isVisible()) {
                await nextBtn.click();
                await page.waitForTimeout(3000);
                pageNum++;
                await randomDelay();
            } else {
                hasMore = false;
            }
        }
    } catch (err) {
        console.error(`[${site}] Fatal Error:`, err.message);
    } finally {
        await browser.close();
    }
    return reviews;
}

if (process.argv[1].endsWith('hotels.js')) {
    run().then(res => console.log(`Finished. Scraped ${res.length} reviews.`));
}
