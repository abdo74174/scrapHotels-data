import { newBrowser, dismissConsent } from '../common/browser.js';
import { inRange } from '../common/utils.js';
import { SELECTORS, API_CONFIG } from './constants.js';
import { parseAgodaPage } from './utils/parser.js';

export async function scrapeAgoda(socket, dateFrom, dateTo, hotelUrl) {
    const reviews = [];
    const emit = (event, data) => {
        if (socket) {
            socket.emit(event, data);
        } else if (data.msg) {
            console.log(`[Agoda] ${data.msg}`);
        }
    };

    const browser = await newBrowser();
    try {
        const ctx = await browser.newContext({
            locale: 'en-US',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
        });
        const page = await ctx.newPage();

        // ── Register API interceptor BEFORE navigating ──
        let capturedPostData = null;
        let capturedHeaders = null;

        page.on('request', (request) => {
            const url = request.url();
            if (url.includes('HotelReviews') || url.includes('hotelReviews')) {
                capturedPostData = request.postData();
                capturedHeaders = request.headers();
                console.log('[Agoda] Intercepted reviews API request');
            }
        });

        emit('site_status', { site: 'agoda', msg: 'Loading page...' });
        console.log(`[Agoda] Navigating to ${hotelUrl}...`);
        await page.goto(hotelUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);
        await dismissConsent(page);

        // Scroll progressively to trigger lazy-loaded reviews API call
        emit('site_status', { site: 'agoda', msg: 'Scrolling to find reviews...' });
        for (let scrollStep = 0; scrollStep < 10; scrollStep++) {
            if (capturedPostData) break; // Got it
            await page.evaluate((step) => {
                window.scrollTo(0, document.body.scrollHeight * ((step + 1) / 10));
            }, scrollStep);
            await page.waitForTimeout(1500);
        }

        // Wait a bit more even after scrolling
        if (!capturedPostData) {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(5000);
        }

        // ── API approach ──
        if (capturedPostData && capturedHeaders) {
            console.log('[Agoda] Using API approach (most reliable)');
            emit('site_status', { site: 'agoda', msg: 'API intercepted! Fetching all reviews...' });
            const result = await scrapeViaAPI(page, capturedPostData, capturedHeaders, reviews, emit, dateFrom, dateTo);
            if (result) return reviews;
        }

        // ── Fallback: try to extract hotelId from page source and call API directly ──
        console.log('[Agoda] API not intercepted during scroll. Trying to extract hotelId from page...');
        const hotelId = await page.evaluate(() => {
            // Agoda embeds hotelId in various places
            const html = document.documentElement.innerHTML;
            const match = html.match(/"hotelId"\s*:\s*(\d+)/);
            if (match) return parseInt(match[1]);
            const match2 = html.match(/hotel[_-]?id['"]\s*:\s*['"]?(\d+)/i);
            if (match2) return parseInt(match2[1]);
            return null;
        });

        if (hotelId) {
            console.log(`[Agoda] Found hotelId=${hotelId} from page source. Calling API directly...`);
            emit('site_status', { site: 'agoda', msg: `Found Hotel ID: ${hotelId}. Fetching via API...` });
            const directResult = await scrapeViaDirectAPI(page, hotelId, reviews, emit, dateFrom, dateTo);
            if (directResult) return reviews;
        }

        // ── Last resort: DOM scraping ──
        console.log('[Agoda] All API methods failed. Falling back to DOM scraping...');
        await page.evaluate(() => {
            const reviewSection = document.querySelector('#reviewSectionComments, [data-element-name="review-comments"]');
            if (reviewSection) reviewSection.scrollIntoView({ behavior: 'instant', block: 'start' });
            else window.scrollTo(0, document.body.scrollHeight * 0.7);
        });
        await page.waitForTimeout(2000);
        await scrapeViaDOM(page, reviews, emit, dateFrom, dateTo);

    } finally {
        await browser.close();
    }
    return reviews;
}

// ── API-based scraping (using intercepted request) ──
async function scrapeViaAPI(page, capturedPostData, capturedHeaders, reviews, emit, dateFrom, dateTo) {
    try {
        const postBody = JSON.parse(capturedPostData);
        const hotelId = postBody.hotelId;
        const pageSize = postBody.pageSize || API_CONFIG.DEFAULT_PAGE_SIZE;

        console.log(`[Agoda] Hotel ID: ${hotelId}, Page size: ${pageSize}`);

        // Build headers from captured
        const apiHeaders = {};
        const headersToCopy = [
            'accept', 'content-type', 'x-requested-with', 'ag-language-id',
            'ag-language-locale', 'cr-currency-id', 'cr-currency-code',
            'ag-analytics-session-id', 'ag-correlation-id', 'x-gate-meta',
            'ag-request-attempt'
        ];
        for (const h of headersToCopy) {
            if (capturedHeaders[h]) apiHeaders[h] = capturedHeaders[h];
        }
        // Ensure essential headers
        apiHeaders['accept'] = apiHeaders['accept'] || 'application/json';
        apiHeaders['content-type'] = apiHeaders['content-type'] || 'application/json; charset=UTF-8';
        apiHeaders['x-requested-with'] = apiHeaders['x-requested-with'] || 'XMLHttpRequest';

        return await fetchAllPages(page, hotelId, pageSize, postBody.hotelProviderId || 332, apiHeaders, reviews, emit, dateFrom, dateTo);
    } catch (e) {
        console.log('[Agoda] API approach failed:', e.message);
        return false;
    }
}

// ── Direct API call (when we find hotelId from page source) ──
async function scrapeViaDirectAPI(page, hotelId, reviews, emit, dateFrom, dateTo) {
    try {
        const apiHeaders = {
            'accept': 'application/json',
            'content-type': 'application/json; charset=UTF-8',
            'x-requested-with': 'XMLHttpRequest',
        };
        return await fetchAllPages(page, hotelId, API_CONFIG.DEFAULT_PAGE_SIZE, 332, apiHeaders, reviews, emit, dateFrom, dateTo);
    } catch (e) {
        console.log('[Agoda] Direct API approach failed:', e.message);
        return false;
    }
}

// ── Shared: paginate through all API pages ──
async function fetchAllPages(page, hotelId, pageSize, providerId, apiHeaders, reviews, emit, dateFrom, dateTo) {
    let pageNum = 1;
    const maxPages = 200;

    while (pageNum <= maxPages) {
        emit('site_status', { site: 'agoda', msg: `API Page ${pageNum} — ${reviews.length} reviews so far...` });
        console.log(`[Agoda] Fetching API page ${pageNum}...`);

        const requestBody = {
            hotelId,
            hotelProviderId: providerId,
            demographicId: 0,
            pageNo: pageNum,
            pageSize,
            sorting: API_CONFIG.DEFAULT_SORTING,
            reviewProviderIds: API_CONFIG.REVIEW_PROVIDER_IDS,
            isReviewPage: false,
            isCrawlablePage: true,
            paginationSize: 5,
        };

        const apiData = await page.evaluate(async ({ url, body, headers }) => {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(body),
                    credentials: 'include',
                });
                if (!res.ok) return { error: `HTTP ${res.status}` };
                return await res.json();
            } catch (e) {
                return { error: e.message };
            }
        }, { url: API_CONFIG.ENDPOINT, body: requestBody, headers: apiHeaders });

        if (apiData?.error) {
            console.log(`[Agoda] API error on page ${pageNum}: ${apiData.error}`);
            if (pageNum === 1) return false; // First page failed, fallback
            break; // Later page failed, return what we have
        }

        const comments = apiData?.commentList?.comments ?? [];
        const totalCount = apiData?.commentList?.totalCount ?? 0;

        if (comments.length === 0) {
            console.log('[Agoda] No more comments from API.');
            break;
        }

        console.log(`[Agoda] Page ${pageNum}: ${comments.length} comments (total available: ${totalCount})`);

        let pageIn = 0;
        for (const c of comments) {
            const reviewerInfo = c.reviewerInfo || {};
            const review = {
                site: 'Agoda.com',
                reviewerName: reviewerInfo.displayMemberName || '',
                nationality: reviewerInfo.countryName || '',
                date: c.formattedReviewDate || c.reviewDate || '',
                rating: c.formattedRating || String(c.rating || ''),
                title: c.reviewTitle || c.originalTitle || '',
                reviewText: [
                    c.reviewComments,
                    c.reviewPositives ? `Positive: ${c.reviewPositives}` : '',
                    c.reviewNegatives ? `Negative: ${c.reviewNegatives}` : '',
                ].filter(Boolean).join(' | ') || c.originalComment || '',
                roomType: reviewerInfo.roomTypeName || '',
                tripType: reviewerInfo.travellerTypeName || '',
                stayDetail: c.checkInDateMonthAndYear || '',
                scrapedAt: new Date().toISOString(),
            };

            const chk = inRange(review.date, dateFrom, dateTo);
            if (chk !== 'in') continue;

            const isDup = reviews.some(e =>
                e.reviewerName === review.reviewerName &&
                e.reviewText === review.reviewText
            );
            if (isDup) continue;

            pageIn++;
            reviews.push(review);
            emit('new_review', { site: 'agoda', review });
        }

        console.log(`[Agoda] ${pageIn} reviews in range on this page.`);

        if (comments.length > 0 && pageIn === 0 && (dateFrom || dateTo)) {
            console.log('[Agoda] Entire page out of date range, stopping.');
            break;
        }

        if (totalCount > 0 && reviews.length >= totalCount) {
            console.log(`[Agoda] Reached total count (${totalCount}).`);
            break;
        }

        pageNum++;
        await page.waitForTimeout(1000);
    }

    console.log(`[Agoda] API scraping complete. Total: ${reviews.length} reviews.`);
    return true;
}

// ── DOM-based fallback scraping ──
async function scrapeViaDOM(page, reviews, emit, dateFrom, dateTo) {
    let pageNum = 1;
    const seenIds = new Set();

    while (pageNum <= 500) {
        emit('site_status', { site: 'agoda', msg: `DOM Page ${pageNum} — ${reviews.length} reviews...` });
        console.log(`[Agoda] DOM scraping page ${pageNum}...`);

        await page.evaluate(() => window.scrollBy(0, 500));
        await page.waitForTimeout(2000);

        // Get card IDs to detect if page actually changed
        const rawCards = await parseAgodaPage(page, SELECTORS);
        console.log(`[Agoda] Found ${rawCards.length} cards on page ${pageNum}.`);

        if (rawCards.length === 0) {
            console.log('[Agoda] No cards found. Stopping.');
            break;
        }

        // Check if these are the same cards as before (pagination didn't work)
        const pageFingerprint = rawCards.map(r => `${r.reviewerName}|${r.reviewText?.slice(0, 50)}`).join(';;');
        if (seenIds.has(pageFingerprint)) {
            console.log('[Agoda] Same cards as previous page — pagination is not working. Stopping.');
            break;
        }
        seenIds.add(pageFingerprint);

        let pageReviewsIn = 0;
        for (const r of rawCards) {
            const chk = inRange(r.date, dateFrom, dateTo);
            if (chk !== 'in') continue;

            const isDup = reviews.some(existing =>
                existing.reviewText === r.reviewText &&
                existing.reviewerName === r.reviewerName
            );
            if (isDup) continue;

            pageReviewsIn++;
            const reviewEntry = { site: 'Agoda.com', ...r, scrapedAt: new Date().toISOString() };
            reviews.push(reviewEntry);
            emit('new_review', { site: 'agoda', review: reviewEntry });
        }

        console.log(`[Agoda] ${pageReviewsIn} reviews in range.`);

        if (rawCards.length > 0 && pageReviewsIn === 0 && (dateFrom || dateTo)) {
            console.log('[Agoda] Entire page out of range, stopping.');
            break;
        }

        const nextBtn = page.locator(SELECTORS.NEXT_BUTTON.join(', ')).first();
        try {
            if (await nextBtn.isVisible({ timeout: 5000 })) {
                console.log('[Agoda] Clicking Next button...');
                await nextBtn.scrollIntoViewIfNeeded();
                await page.waitForTimeout(500);
                await nextBtn.click({ force: true });
                await page.waitForTimeout(5000);
                pageNum++;
            } else {
                console.log('[Agoda] Next button not visible. Reached end.');
                break;
            }
        } catch (e) {
            console.log('[Agoda] Pagination failed:', e.message);
            break;
        }
    }
}
