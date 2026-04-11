// debug-agoda.js — run this ONCE to find real selectors
import { newBrowser, dismissConsent } from './services/common/browser.js';

async function debugAgoda() {
    const browser = await newBrowser();
    const ctx = await browser.newContext({
        locale: 'en-US',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    });
    const page = await ctx.newPage();

    // Intercept network requests to find the reviews API
    const apiCalls = [];
    page.on('response', async (response) => {
        const url = response.url();
        if (
            (url.includes('review') || url.includes('Review')) &&
            response.status() === 200 &&
            response.headers()['content-type']?.includes('json')
        ) {
            try {
                const json = await response.json();
                apiCalls.push({
                    url: url.slice(0, 300),
                    keys: Object.keys(json).slice(0, 20),
                    hasReviews: !!(json?.reviews || json?.data?.reviews || json?.result?.reviews || json?.commentList?.comments),
                    sampleKeys: json?.reviews?.[0] ? Object.keys(json.reviews[0]) : 
                                json?.data?.reviews?.[0] ? Object.keys(json.data.reviews[0]) :
                                json?.commentList?.comments?.[0] ? Object.keys(json.commentList.comments[0]) :
                                null
                });
            } catch {}
        }
    });

    console.log('[Debug] Navigating to Agoda...');
    await page.goto('https://www.agoda.com/four-seasons-hotel-cairo-at-the-first-residence/hotel/giza-eg.html', {
        waitUntil: 'domcontentloaded', timeout: 60000
    });
    await page.waitForTimeout(6000);
    await dismissConsent(page);

    // Scroll down to trigger review loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(3000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(3000);

    console.log('\n=== STEP 1: DOM ANALYSIS ===');
    const info = await page.evaluate(() => {
        const results = {};

        // Find the reviews tab button
        const allButtons = [...document.querySelectorAll('button, [role="tab"], a')];
        const reviewBtns = allButtons.filter(b => /review/i.test(b.textContent) || /review/i.test(b.getAttribute('aria-label') || ''));
        results.reviewTabs = reviewBtns.map(b => ({
            tag: b.tagName,
            text: b.textContent.trim().slice(0, 80),
            id: b.id,
            classes: b.className.slice(0, 150),
            ariaLabel: b.getAttribute('aria-label'),
            dataAttrs: [...b.attributes]
                .filter(a => a.name.startsWith('data'))
                .map(a => `${a.name}="${a.value}"`)
        }));

        // Find review cards with many selectors
        const cardCandidates = [
            '[data-selenium="review-item"]',
            '[data-info-type="review-card"]',
            '[class*="Review-comment"]',
            '[class*="Review"]',
            '[class*="review-item"]',
            '[class*="ReviewItem"]',
            '[class*="review_item"]',
            '[class*="review-card"]',
            '[class*="ReviewCard"]',
            '[data-testid*="review"]',
            '[class*="comment-card"]',
            '[class*="CommentCard"]',
            '[class*="comment-item"]',
            '[class*="ReviewComment"]',
            '[class*="reviewComment"]',
        ];
        results.cardSelectors = {};
        for (const sel of cardCandidates) {
            try {
                const count = document.querySelectorAll(sel).length;
                if (count > 0) results.cardSelectors[sel] = count;
            } catch {}
        }

        // Get outerHTML of the first found card
        let firstCard = null;
        for (const sel of Object.keys(results.cardSelectors)) {
            const el = document.querySelector(sel);
            if (el) {
                firstCard = el;
                break;
            }
        }
        results.firstCardHTML = firstCard ? firstCard.outerHTML.slice(0, 2000) : 'NOT FOUND';
        results.firstCardClasses = firstCard ? firstCard.className : 'NOT FOUND';
        results.firstCardTag = firstCard ? firstCard.tagName : 'NOT FOUND';

        // Find next page button
        const nextCandidates = [...document.querySelectorAll('button, [role="button"], a')]
            .filter(b => {
                const text = b.textContent?.trim() || '';
                const aria = b.getAttribute('aria-label') || '';
                const cls = b.className || '';
                return /next/i.test(text) || /next/i.test(aria) || /next/i.test(cls) || 
                       /pagination/i.test(cls) || b.textContent?.trim() === '>';
            });
        results.nextButtons = nextCandidates.map(b => ({
            tag: b.tagName,
            text: b.textContent.trim().slice(0, 50),
            ariaLabel: b.getAttribute('aria-label'),
            classes: b.className.slice(0, 150),
            id: b.id,
            dataAttrs: [...b.attributes]
                .filter(a => a.name.startsWith('data'))
                .map(a => `${a.name}="${a.value}"`)
        }));

        // Find any pagination containers
        const paginationEls = document.querySelectorAll('[class*="pagination"], [class*="Pagination"], [class*="paging"], [class*="Paging"]');
        results.paginationElements = [...paginationEls].map(p => ({
            tag: p.tagName,
            classes: p.className.slice(0, 150),
            childCount: p.children.length,
            innerHTML: p.innerHTML.slice(0, 500)
        }));

        // Look for chevron/arrow buttons near reviews
        const arrowBtns = [...document.querySelectorAll('button svg, button i, button span')]
            .filter(el => {
                const parent = el.closest('button');
                if (!parent) return false;
                const rect = parent.getBoundingClientRect();
                return rect.top > window.innerHeight * 0.5; // Only bottom half
            })
            .map(el => {
                const parent = el.closest('button');
                return {
                    buttonText: parent.textContent.trim().slice(0, 30),
                    buttonClasses: parent.className.slice(0, 100),
                    buttonAriaLabel: parent.getAttribute('aria-label'),
                    buttonHTML: parent.outerHTML.slice(0, 300)
                };
            });
        results.arrowButtons = arrowBtns.slice(0, 10);

        return results;
    });

    console.log(JSON.stringify(info, null, 2));

    // Now try clicking the reviews tab
    console.log('\n=== STEP 2: CLICKING REVIEWS TAB ===');
    try {
        const allButtons = await page.locator('button, [role="tab"]').all();
        for (const btn of allButtons) {
            const text = await btn.textContent();
            if (/review/i.test(text)) {
                console.log(`Found reviews button with text: "${text.trim().slice(0, 50)}"`);
                await btn.click({ force: true });
                await page.waitForTimeout(4000);

                // Re-check dom after click
                const afterClick = await page.evaluate(() => {
                    const modal = document.querySelector('[role="dialog"]');
                    const cardCandidates = [
                        '[data-selenium="review-item"]',
                        '[data-info-type="review-card"]',
                        '[class*="Review-comment"]',
                        '[class*="Review"]',
                        '[class*="review-card"]',
                        '[class*="ReviewCard"]',
                        '[class*="comment-card"]',
                        '[class*="CommentCard"]',
                        '[class*="ReviewComment"]',
                    ];
                    const counts = {};
                    for (const sel of cardCandidates) {
                        try {
                            const count = document.querySelectorAll(sel).length;
                            if (count > 0) counts[sel] = count;
                        } catch {}
                    }

                    // Check pagination inside modal
                    const paginationInModal = modal ? 
                        [...modal.querySelectorAll('button, [role="button"]')]
                            .filter(b => {
                                const t = b.textContent?.trim() || '';
                                const a = b.getAttribute('aria-label') || '';
                                return /next|>/i.test(t) || /next/i.test(a) || t === '>';
                            })
                            .map(b => ({
                                text: b.textContent.trim().slice(0, 30),
                                ariaLabel: b.getAttribute('aria-label'),
                                classes: b.className.slice(0, 100),
                                html: b.outerHTML.slice(0, 300)
                            })) : [];

                    return {
                        modalFound: !!modal,
                        modalClasses: modal?.className?.slice(0, 150) || '',
                        cardCounts: counts,
                        paginationInModal
                    };
                });
                console.log('After clicking Reviews tab:');
                console.log(JSON.stringify(afterClick, null, 2));
                break;
            }
        }
    } catch (e) {
        console.log('Error clicking reviews tab:', e.message);
    }

    console.log('\n=== STEP 3: API CALLS INTERCEPTED ===');
    console.log(JSON.stringify(apiCalls, null, 2));

    // Now scroll inside the modal if it exists to trigger more API calls
    await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        if (modal) {
            modal.scrollTo(0, modal.scrollHeight);
        }
    });
    await page.waitForTimeout(3000);

    console.log('\n=== STEP 4: API CALLS AFTER SCROLL ===');
    console.log(JSON.stringify(apiCalls, null, 2));

    await browser.close();
    console.log('\n[Debug] Done.');
}

debugAgoda().catch(console.error);
