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
    const site = 'Tripadvisor.com';
    const reviews = [];
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: userAgents[Math.floor(Math.random() * userAgents.length)]
    });

    try {
        const page = await context.newPage();
        const url = hotelUrl || config.urls.tripadvisor;
        console.log(`[${site}] Starting scrape for ${url}...`);
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        let pageNum = 1;
        let hasMore = true;

        while (hasMore && pageNum <= (options.maxPages || config.options.maxPages)) {
            console.log(`[${site}] Scraping page ${pageNum}...`);
            
            // Wait for review cards
            await page.waitForSelector('[data-automation="reviewCard"], div[class*="ReviewCard"]', { timeout: 10000 }).catch(() => null);

            const rawCards = await page.evaluate(() => {
                const cards = document.querySelectorAll('[data-automation="reviewCard"], div[class*="ReviewCard"]');
                return Array.from(cards).map(card => {
                    const get = (...sels) => {
                        for (const s of sels) {
                            const el = card.querySelector(s);
                            if (el && el.innerText.trim()) return el.innerText.trim();
                        }
                        return '';
                    };
                    
                    // TripAdvisor rating is usually in a class bubble_XX
                    let rating = '';
                    const ratingEl = card.querySelector('span[class*="ui_bubble_rating"], span[class*="bubble_rating"]');
                    if (ratingEl) {
                        const scoreMatch = ratingEl.className.match(/bubble_(\d+)/);
                        if (scoreMatch) rating = scoreMatch[1] / 10;
                    }

                    return {
                        reviewerName: get('span[class*="username"]'),
                        nationality: get('div[class*="userLocation"]'),
                        date: get('div[class*="date"]'),
                        rating: rating.toString(),
                        title: get('h3[class*="title"]', 'span[class*="title"]'),
                        reviewText: get('span[class*="reviewText"]'),
                        positive: '',
                        negative: '',
                        roomType: '',
                        tripType: get('span[class*="tripType"]')
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

            fs.writeFileSync(config.outputs.tripadvisor, JSON.stringify(reviews, null, 2));
            console.log(`[${site}] Current total: ${reviews.length}`);

            const nextBtn = page.locator('a[class*="next"], button[class*="next"]').first();
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

if (process.argv[1].endsWith('tripadvisor.js')) {
    run().then(res => console.log(`Finished. Scraped ${res.length} reviews.`));
}
