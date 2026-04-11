import { newBrowser, dismissConsent } from '../common/browser.js';
import { inRange } from '../common/utils.js';

export async function scrapeTripAdvisor(socket, dateFrom, dateTo, hotelUrl, defaultUrls) {
    const reviews = [];
    const seenFps = new Set();
    const url = hotelUrl || (defaultUrls && defaultUrls.tripadvisor) || '';
    if (!url) throw new Error('No hotel URL provided for TripAdvisor');

    const emit = (msg) => {
        if (socket) socket.emit('site_status', { site: 'tripadvisor', msg });
        console.log(`[TripAdvisor] ${msg}`);
    };

    const browser = await newBrowser();
    try {
        const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 1000 } });
        const page = await ctx.newPage();
        
        let stopped = false;

        // --- Intercept API ---
        page.on('response', async (response) => {
            if (response.url().includes('graphql') && response.status() === 200) {
                try {
                    const json = await response.json();
                    const walkPayload = (node) => {
                        if (!node || typeof node !== 'object') return;
                        if (Array.isArray(node)) { node.forEach(walkPayload); return; }
                        
                        if (node.ReviewsProxy_getReviewListPageForLocation || node.reviews) {
                            const locations = Array.isArray(node.ReviewsProxy_getReviewListPageForLocation) ? node.ReviewsProxy_getReviewListPageForLocation : [node.ReviewsProxy_getReviewListPageForLocation || node];
                            
                            for (const loc of locations) {
                                if (loc && Array.isArray(loc.reviews)) {
                                    console.log(`[TA API] Found ${loc.reviews.length} reviews array`);
                                    for (const r of loc.reviews) {
                                        if (r.text) {
                                            const d = r.publishedDate || r.tripInfo?.stayDate || '';
                                            const t = r.text || '';
                                            const user = r.userProfile?.displayName || 'Guest';
                                            
                                            const fp = `${user}|${d}|${t.slice(0,100)}`.toLowerCase();
                                            if (seenFps.has(fp)) continue;
                                            
                                            const chk = inRange(d, dateFrom, dateTo);
                                            if (chk === 'after') continue;
                                            if (chk === 'before') { stopped = true; continue; }

                                            seenFps.add(fp);
                                            const entry = {
                                                site: 'Tripadvisor.com',
                                                reviewerName: user,
                                                date: d,
                                                rating: String(r.rating || ''),
                                                title: r.title || '',
                                                reviewText: t,
                                                scrapedAt: new Date().toISOString()
                                            };
                                            reviews.push(entry);
                                            if (socket) socket.emit('new_review', { site: 'tripadvisor', review: entry });
                                        }
                                    }
                                }
                            }
                        }
                        
                        // Recurse heavily into arrays looking for `reviews` list
                        const vals = Object.values(node);
                        for(const v of vals) walkPayload(v);
                    };
                    walkPayload(json);
                } catch(e){}
            }
        });

        emit('Opening TripAdvisor...');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);
        await dismissConsent(page);

        let pageNum = 1;
        while (!stopped && pageNum <= 100) {
            emit(`Page ${pageNum} — ${reviews.length} reviews...`);
            
            await page.waitForTimeout(4000); // Give API time to respond

            // Click NEXT button to load next page of reviews via API
            const nextBtns = await page.$$('a[class*="next"], button[class*="next"], a.ui_button.nav.next.primary, .nav.next');
            let clicked = false;
            for (const btn of nextBtns) {
                if (await btn.isVisible()) {
                    await btn.click();
                    clicked = true;
                    await page.waitForTimeout(3000);
                    break;
                }
            }
            if (!clicked) break;
            pageNum++;
        }
    } finally {
        await browser.close().catch(() => {});
    }
    emit(`Done! Extracted ${reviews.length} total reviews.`);
    return reviews;
}
