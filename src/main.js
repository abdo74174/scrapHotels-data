// Booking.com Review Scraper — Jerome House
import { PlaywrightCrawler } from 'crawlee';
import fs from 'node:fs';

// ══════════════════════════════════════════════════════════════════
//  ✏️  EDIT THESE SETTINGS BEFORE RUNNING
// ══════════════════════════════════════════════════════════════════

const HOTEL_URL =
    'https://www.booking.com/hotel/cz/jeromehouse.en-gb.html';

// Hotel name saved in every review record
const HOTEL_NAME = 'Jerome House';

// Max review pages to crawl (each page ~10 reviews)
const MAX_REVIEW_PAGES = 400;

// ── Date filter ────────────────────────────────────────────────────
// Keep only reviews that were POSTED between these two dates.
// Format: 'YYYY-MM-DD'   |   Set to null to disable the filter.
//
//   Example — only reviews from 2023:
//     const DATE_FROM = '2023-01-01';
//     const DATE_TO   = '2023-12-31';
//
const DATE_FROM = null;   // e.g. '2022-01-01'
const DATE_TO = null;   // e.g. '2024-12-31'

// Output file — all reviews merged into one JSON array
const OUTPUT_FILE = './all_reviews.json';

// ══════════════════════════════════════════════════════════════════

/** Try to parse a review date string like "Reviewed: December 2023"
 *  Returns a Date object, or null if parsing fails. */
function parseReviewDate(dateStr) {
    if (!dateStr) return null;

    // Strip common prefixes
    const cleaned = dateStr.replace(/reviewed\s*:\s*/i, '').trim();

    // Try direct parsing
    const d = new Date(cleaned);
    if (!isNaN(d)) return d;

    // Try "Month YYYY" format (e.g. "December 2023")
    const match = cleaned.match(/([A-Za-z]+)\s+(\d{4})/);
    if (match) {
        const parsed = new Date(`${match[1]} 1, ${match[2]}`);
        if (!isNaN(parsed)) return parsed;
    }

    return null;
}

/** Returns true if the review passes the configured date filter. */
function passesDateFilter(dateStr) {
    if (!DATE_FROM && !DATE_TO) return true;  // no filter applied

    const reviewDate = parseReviewDate(dateStr);
    if (!reviewDate) return true; // can't parse → keep it

    if (DATE_FROM) {
        const from = new Date(DATE_FROM);
        if (reviewDate < from) return false;
    }

    if (DATE_TO) {
        const to = new Date(DATE_TO);
        to.setHours(23, 59, 59, 999);
        if (reviewDate > to) return false;
    }

    return true;
}

// ── Helpers ────────────────────────────────────────────────────────

/** Click the cookie / GDPR consent banner if it appears. */
async function dismissConsent(page) {
    try {
        const acceptBtn = page.locator('#onetrust-accept-btn-handler');
        if (await acceptBtn.isVisible({ timeout: 5_000 })) {
            await acceptBtn.click();
            await page.waitForTimeout(1_000);
        }
    } catch {
        // No consent banner — that's fine.
    }
}

/** Navigate to the Reviews tab. */
async function openReviewsTab(page, log) {
    const reviewTabSelectors = [
        'a[href*="tab=reviews"]',
        'a[data-tab="reviews"]',
        'li a:has-text("Reviews")',
        'a:has-text("Guest reviews")',
    ];

    for (const sel of reviewTabSelectors) {
        try {
            const el = page.locator(sel).first();
            if (await el.isVisible({ timeout: 3_000 })) {
                await el.click();
                await page.waitForLoadState('networkidle', { timeout: 15_000 });
                log.info('Clicked the Reviews tab.');
                return;
            }
        } catch { /* keep trying */ }
    }

    // Fallback: navigate directly
    const baseUrl = page.url().split('#')[0].split('?')[0];
    const reviewUrl = `${baseUrl}?tab=reviews#tab-reviews`;
    log.info(`Reviews tab not found — navigating to: ${reviewUrl}`);
    await page.goto(reviewUrl, { waitUntil: 'networkidle', timeout: 30_000 });
}

/** Extract all review cards visible on the current page. */
async function extractReviews(page, log) {
    const reviews = [];

    const cardSelectors = [
        '[data-testid="review-card"]',
        '.c-review-block',
        '.review_list_new_item_block',
        '[class*="reviewListItem"]',
    ];

    let cards = [];
    for (const sel of cardSelectors) {
        cards = await page.$$(sel);
        if (cards.length > 0) {
            log.info(`Found ${cards.length} card(s) with: ${sel}`);
            break;
        }
    }

    if (cards.length === 0) {
        log.warning('No review cards found on this page.');
        return reviews;
    }

    for (const card of cards) {
        const get = async (selectors, fallback = '') => {
            for (const s of selectors) {
                try {
                    const el = await card.$(s);
                    if (el) {
                        const text = (await el.innerText()).trim();
                        if (text) return text;
                    }
                } catch { /* skip */ }
            }
            return fallback;
        };

        const reviewer = await get([
            '[data-testid="review-avatar"] + div',
            '.bui-avatar-block__title',
            '.reviewer_name',
            '[class*="reviewerName"]',
        ]);

        const country = await get([
            '[data-testid="review-avatar-flag"] + span',
            '.bui-avatar-block__subtitle',
            '.reviewer_country span',
            '[class*="reviewerCountry"]',
        ]);

        const date = await get([
            '[data-testid="review-date"]',
            '.c-review-block__date',
            '.review_item_date',
            '[class*="reviewDate"]',
        ]);

        const score = await get([
            '[data-testid="review-score"]',
            '.bui-review-score__badge',
            '.review-score-badge',
            '[class*="reviewScore"]',
        ]);

        const title = await get([
            '[data-testid="review-title"]',
            '.c-review-block__title',
            '.review_item_header_content',
            '[class*="reviewTitle"]',
        ]);

        const positive = await get([
            '[data-testid="review-positive-text"]',
            '.c-review__body[data-et-click*="positive"]',
            '.review_pos span',
            '[class*="positiveText"]',
        ]);

        const negative = await get([
            '[data-testid="review-negative-text"]',
            '.c-review__body[data-et-click*="negative"]',
            '.review_neg span',
            '[class*="negativeText"]',
        ]);

        const roomType = await get([
            '[data-testid="review-room-info"]',
            '.c-review-block__room',
            '.review_item_room_info',
            '[class*="roomInfo"]',
        ]);

        const stayDate = await get([
            '[data-testid="review-stay-date"]',
            '.c-review-block__stay-date',
            '[class*="stayDate"]',
        ]);

        const tripType = await get([
            '[data-testid="review-traveler-type"]',
            '.review_item_info_tags li:first-child',
            '[class*="travelerType"]',
        ]);

        if (reviewer || title || positive || negative) {
            reviews.push({
                reviewer: reviewer || 'Anonymous',
                country,
                date,
                score,
                title,
                positive,
                negative,
                roomType,
                stayDate,
                tripType,
            });
        }
    }

    return reviews;
}

// ── In-memory accumulator ──────────────────────────────────────────
const allReviews = [];

// ── Crawler ────────────────────────────────────────────────────────
const crawler = new PlaywrightCrawler({
    headless: false,
    navigationTimeoutSecs: 60,
    requestHandlerTimeoutSecs: 600,
    maxConcurrency: 1,

    async requestHandler({ request, page, log }) {
        log.info(`Opening: ${request.url}`);

        // Print active date filter to terminal
        if (DATE_FROM || DATE_TO) {
            log.info(`🗓  Date filter: ${DATE_FROM ?? 'any'} → ${DATE_TO ?? 'any'}`);
        } else {
            log.info('🗓  Date filter: disabled (collecting all dates)');
        }

        await dismissConsent(page);
        await openReviewsTab(page, log);

        let pageNum = 1;
        let totalKept = 0;
        let totalSkipped = 0;

        while (pageNum <= MAX_REVIEW_PAGES) {
            log.info(`── Review page ${pageNum} ──`);
            await page.waitForTimeout(2_000);

            const reviews = await extractReviews(page, log);

            for (const review of reviews) {
                if (!passesDateFilter(review.date)) {
                    totalSkipped++;
                    log.info(`  ⏭  Skipped (out of date range): ${review.date}`);
                    continue;
                }

                totalKept++;
                const record = {
                    hotelName: HOTEL_NAME,
                    pageNum,
                    ...review,
                    scrapedAt: new Date().toISOString(),
                };

                allReviews.push(record);
                log.info(`  ✅ [${review.score}] ${review.reviewer} — "${review.title}" (${review.date})`);
            }

            if (reviews.length === 0 || pageNum >= MAX_REVIEW_PAGES) break;

            // Click "Next page"
            const nextSelectors = [
                'button[aria-label="Next page"]',
                'a[aria-label="Next page"]',
                '.pagenext',
                '[data-testid="pagination-next"]',
                'button:has-text("Next")',
            ];

            let clicked = false;
            for (const sel of nextSelectors) {
                try {
                    const btn = page.locator(sel).first();
                    if (await btn.isVisible({ timeout: 3_000 })) {
                        await btn.click();
                        await page.waitForTimeout(3_000);
                        clicked = true;
                        break;
                    }
                } catch { /* try next */ }
            }

            if (!clicked) {
                log.info('No "Next page" button — reached the last review page.');
                break;
            }

            pageNum++;
        }

        log.info(`Done. Kept: ${totalKept} | Skipped (date filter): ${totalSkipped}`);
    },
});

// ── Start ──────────────────────────────────────────────────────────
await crawler.run([HOTEL_URL]);

// ── Save all reviews into a single JSON file ───────────────────────
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allReviews, null, 2), 'utf8');

console.log('\n✅  Scraping complete!');
console.log(`📋  Total reviews collected: ${allReviews.length}`);
console.log(`📁  All reviews saved to: ${OUTPUT_FILE}`);
if (DATE_FROM || DATE_TO) {
    console.log(`🗓  Date filter applied: ${DATE_FROM ?? 'any'} → ${DATE_TO ?? 'any'}`);
}
