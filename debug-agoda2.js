// debug-agoda2.js — Capture the API request details
import { newBrowser, dismissConsent } from './services/common/browser.js';

async function debugAgoda() {
    const browser = await newBrowser();
    const ctx = await browser.newContext({
        locale: 'en-US',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    });
    const page = await ctx.newPage();

    // Intercept the exact API request
    let capturedRequest = null;
    let capturedResponse = null;
    
    page.on('request', (request) => {
        if (request.url().includes('/api/cronos/property/review/HotelReviews')) {
            capturedRequest = {
                url: request.url(),
                method: request.method(),
                headers: request.headers(),
                postData: request.postData()
            };
        }
    });
    
    page.on('response', async (response) => {
        if (response.url().includes('/api/cronos/property/review/HotelReviews')) {
            try {
                const json = await response.json();
                capturedResponse = {
                    status: response.status(),
                    hotelId: json.hotelId,
                    hotelName: json.hotelName,
                    pageSize: json.pageSize,
                    totalComments: json.commentList?.totalCount,
                    commentsOnPage: json.commentList?.comments?.length,
                    firstComment: json.commentList?.comments?.[0],
                    reviewerInfoSample: json.commentList?.comments?.[0]?.reviewerInfo,
                };
            } catch {}
        }
    });

    console.log('[Debug] Navigating...');
    await page.goto('https://www.agoda.com/four-seasons-hotel-cairo-at-the-first-residence/hotel/giza-eg.html', {
        waitUntil: 'domcontentloaded', timeout: 60000
    });
    await page.waitForTimeout(8000);
    await dismissConsent(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(3000);

    console.log('\n=== CAPTURED REQUEST ===');
    console.log(JSON.stringify(capturedRequest, null, 2));
    
    console.log('\n=== CAPTURED RESPONSE ===');
    console.log(JSON.stringify(capturedResponse, null, 2));

    // Also grab the card selectors and next button from the inline page
    const domInfo = await page.evaluate(() => {
        const cardCandidates = [
            '[data-selenium="review-item"]',
            '[data-info-type="review-card"]',
            '[class*="Review-comment"]',
            '[class*="review-card"]',
            '[class*="ReviewCard"]',
            '[class*="ReviewComment"]',
            '[class*="comment-card"]',
            '[class*="CommentCard"]',
        ];
        const counts = {};
        for (const sel of cardCandidates) {
            try {
                const c = document.querySelectorAll(sel).length;
                if (c > 0) counts[sel] = c;
            } catch {}
        }

        // Get first card HTML
        let sample = null;
        for (const sel of Object.keys(counts)) {
            const el = document.querySelector(sel);
            if (el) { sample = el.outerHTML.slice(0, 1500); break; }
        }

        // Next button
        const nextBtns = [...document.querySelectorAll('[data-element-name="review-paginator-next"]')];
        
        return { counts, sample, nextBtnCount: nextBtns.length, nextBtnHTML: nextBtns[0]?.outerHTML?.slice(0, 300) };
    });

    console.log('\n=== DOM CARDS ===');
    console.log(JSON.stringify(domInfo, null, 2));

    await browser.close();
}

debugAgoda().catch(console.error);
