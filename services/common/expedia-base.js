import { newBrowser, dismissConsent } from './browser.js';
import { inRange } from './utils.js';
import fs from 'node:fs';

export async function scrapeExpediaLike(siteKey, siteName, socket, dateFrom, dateTo, hotelUrl) {
    const reviews = [];
    const seenFps = new Set();
    if (!hotelUrl) throw new Error(`No hotel URL provided for ${siteName}`);

    const emit = (msg) => {
        if (socket) socket.emit('site_status', { site: siteKey, msg });
        console.log(`[${siteName}] ${msg}`);
    };

    const addReview = (r) => {
        if (!r.reviewText && !r.reviewerName) return;
        
        const rawDate = r.date;
        const dateStr = typeof rawDate === 'string' ? rawDate.trim() : String(rawDate || '');

        const fp = `${r.reviewerName}|${dateStr}|${(r.reviewText || '').slice(0, 150)}`
            .toLowerCase().replace(/\s+/g, '');
        if (seenFps.has(fp)) return;

        const chk = inRange(dateStr, dateFrom, dateTo);
        if (chk === 'after') return;
        if (chk === 'before') return 'stop';

        seenFps.add(fp);
        const entry = { site: siteName, ...r, date: dateStr, scrapedAt: new Date().toISOString() };
        reviews.push(entry);
        if (socket) socket.emit('new_review', { site: siteKey, review: entry });
        return 'added';
    };

    const browser = await newBrowser();
    try {
        const ctx = await browser.newContext({
            locale: 'en-US',
            viewport: { width: 1280, height: 1000 },
        });
        const page = await ctx.newPage();

        // ── 1: Register Interceptor for the Reviews API ──
        page.on('response', async (response) => {
            const reqUrl = response.url();
            
            if (reqUrl.includes('/api/v3/reviews') || reqUrl.includes('reviews-summary') || reqUrl.includes('graphql') || reqUrl.includes('propertyReviews')) {
                const ct = response.headers()['content-type'] || '';
                if (!ct.includes('json')) return;

                if (response.status() !== 200) return;

                try {
                    const json = await response.json();
                    
                    const extracted = typeof json.reviews !== 'undefined' ? json.reviews :
                                      typeof json.reviewInfo?.reviews !== 'undefined' ? json.reviewInfo.reviews :
                                      extractReviewsFromGraphQL(json); 

                    if (Array.isArray(extracted) && extracted.length > 0) {
                        let stopped = false;
                        for (const raw of extracted) { 
                            const r = {
                                reviewerName: raw.reviewer?.name || raw.reviewerName || raw.userNickname || '',
                                date: raw.submissionDate || raw.submissionTime || raw.date || raw.formattedDate || '',
                                rating: raw.reviewScoreWithDescription?.value || raw.ratingValue || raw.overallScore || raw.rating || '',
                                title: raw.title || raw.headline || raw.heading || '',
                                reviewText: raw.text || raw.reviewText || raw.body || raw.comment || '',
                                positive: raw.pros || '',
                                negative: raw.cons || '',
                            };
                            
                            if (!r.reviewerName && raw.author) {
                                r.reviewerName = typeof raw.author === 'object' ? raw.author.name || raw.author.displayName : raw.author;
                            }

                            if (addReview(r) === 'stop') stopped = true; 
                        }
                        if (!stopped) {
                            emit(`Intercepted ${extracted.length} reviews from API.`);
                        }
                    }
                } catch (e) { }
            }
        });

        // ── 2: Navigate and trigger the modal ──
        emit(`Navigating to ${siteName}...`);
        
        let targetUrl = hotelUrl.split('?')[0];
        targetUrl = `${targetUrl}?pwaDialog=reviews-property-reviews-wrapper-1`;

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 50000 });
        await page.waitForTimeout(4000);
        await dismissConsent(page);

        // Wait completely to settle
        await page.waitForTimeout(2000);

        // In case `reviews-property-reviews-wrapper-1` spawned a sub-modal button (like Hotels.com)
        emit('Checking for "See all reviews" buttons to trigger modal...');
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button:not(:disabled)'));
            const reviewBtns = btns.filter(b => (b.innerText || '').toLowerCase().includes('review') && (b.innerText || '').toLowerCase().includes('all'));
            if (reviewBtns.length > 0) {
                reviewBtns[0].click();
            }
        });

        await page.waitForTimeout(4000);
        
        try {
            await page.waitForSelector('[data-stid="reviews-list"] li, div[class*="review-"], [class*="uitk-dialog"]', { timeout: 8000 });
        } catch { }

        let lastCount = 0;
        let stalledCount = 0;
        let pageNum = 1;

        while (pageNum <= 100) {
            // Scroll down
            await page.evaluate(async () => {
                const diag = document.querySelector('[role="dialog"], [class*="dialog"], [class*="Modal"], [data-stid="reviews-list"]') || document.body;
                for (let i = 0; i < 8; i++) {
                    diag.scrollBy(0, 1000);
                    await new Promise(r => setTimeout(r, 400));
                }
            });
            await page.waitForTimeout(3000);

            if (reviews.length === lastCount) {
                stalledCount++;
                const more = page.locator('button:has-text("Show more"), button:has-text("Next"), [data-stid="pagination-next-btn"]').first();
                if (await more.isVisible({ timeout: 1000 })) {
                    await more.click({ force: true });
                    await page.waitForTimeout(3000);
                    stalledCount = 0;
                } else if (stalledCount >= 4) {
                    break;
                }
            } else {
                stalledCount = 0;
            }
            lastCount = reviews.length;
            pageNum++;
        }

    } finally {
        await browser.close().catch(() => {});
    }

    emit(`Done! Scraped ${reviews.length} total reviews.`);
    return reviews;
}

function extractReviewsFromGraphQL(json) {
    const out = [];
    const walk = (node, d = 0) => {
        if (!node || typeof node !== 'object' || d > 25) return;
        if (Array.isArray(node)) { node.forEach(n => walk(n, d + 1)); return; }

        const text = node.text || node.body || node.reviewText || node.comment || '';
        let author = node.userNickname || node.reviewerName || node.author || node.reviewer || node.user || '';
        if (author && typeof author === 'object') author = author.name || author.displayName || '';
        const score = node.overallScore ?? node.ratingValue ?? node.rating ?? node.guestRating ?? node.score ?? '';

        if (text && (author || score)) {
            out.push({
                reviewerName: String(author || 'Guest').trim(),
                date: String(node.formattedDate || node.submissionTime || node.submissionDate || node.date || ''),
                rating: String(score),
                title: String(node.title || node.headline || node.heading || ''),
                reviewText: String(text).trim(),
                positive: String(node.pros || ''),
                negative: String(node.cons || ''),
            });
            return;
        }
        Object.values(node).forEach(v => walk(v, d + 1));
    };
    walk(json);
    return out;
}
