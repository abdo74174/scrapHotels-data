import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const app = express();
const server = createServer(app);
const io = new Server(server);
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

const DATA_DIR = './data';
const STATE_FILE = path.join(DATA_DIR, 'scrape_state.json');
const URLS_FILE = path.join(DATA_DIR, 'hotel_urls.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function normalizeUrl(url) {
    if (!url) return '';
    let cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
        cleanUrl = 'https://' + cleanUrl;
    }
    return cleanUrl;
}

function loadHotelUrls() {
    try {
        if (fs.existsSync(URLS_FILE)) {
            const urls = JSON.parse(fs.readFileSync(URLS_FILE, 'utf8'));
            const normalized = {};
            for (const [key, value] of Object.entries(urls)) {
                normalized[key] = normalizeUrl(value);
            }
            return normalized;
        }
    } catch (e) {
        console.error('Error loading hotel_urls.json:', e.message);
    }
    return {};
}

const DEFAULT_URLS = loadHotelUrls();

const SITE_CONFIGS = {
    booking: { name: 'Booking.com', outputFile: path.join(DATA_DIR, 'reviews_booking.json') },
    agoda: { name: 'Agoda.com', outputFile: path.join(DATA_DIR, 'reviews_agoda.json') },
    expedia: { name: 'Expedia.com', outputFile: path.join(DATA_DIR, 'reviews_expedia.json') },
    hotels: { name: 'Hotels.com', outputFile: path.join(DATA_DIR, 'reviews_hotels.json') },
    tripadvisor: { name: 'Tripadvisor.com', outputFile: path.join(DATA_DIR, 'reviews_tripadvisor.json') },
};

// ═══════════════════════════════════════════════════════════
//  STATE HELPERS
// ═══════════════════════════════════════════════════════════
function loadState() {
    try { if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { }
    return {};
}
function saveState(state) { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); }
function updateSiteState(siteKey, lastReviewDate, total) {
    const state = loadState();
    state[siteKey] = {
        siteName: SITE_CONFIGS[siteKey].name,
        lastScrapedAt: new Date().toISOString(),
        lastReviewDate: lastReviewDate || '',
        totalReviews: total,
    };
    saveState(state);
    return state;
}
function loadReviews(siteKey) {
    try { if (fs.existsSync(SITE_CONFIGS[siteKey].outputFile)) return JSON.parse(fs.readFileSync(SITE_CONFIGS[siteKey].outputFile, 'utf8')); } catch { }
    return [];
}
function saveReviews(siteKey, reviews) {
    fs.writeFileSync(SITE_CONFIGS[siteKey].outputFile, JSON.stringify(reviews, null, 2));
}

// ═══════════════════════════════════════════════════════════
//  DATE HELPERS
// ═══════════════════════════════════════════════════════════
function parseDate(str) {
    if (!str) return null;
    const clean = str.replace(/reviewed|written|posted|date of stay|stayed in|:|\n/gi, ' ').trim();
    const d = new Date(clean);
    if (!isNaN(d)) return d;
    const m = clean.match(/([A-Za-z]+)\s+(\d{4})/);
    if (m) { const p = new Date(`${m[1]} 1, ${m[2]}`); if (!isNaN(p)) return p; }
    const m2 = clean.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (m2) { const p = new Date(`${m2[2]} ${m2[1]}, ${m2[3]}`); if (!isNaN(p)) return p; }
    return null;
}
function inRange(dateStr, from, to) {
    const d = parseDate(dateStr);
    if (!d) return 'ok';
    if (from && d < new Date(from)) return 'before';
    if (to) { const t = new Date(to); t.setHours(23, 59, 59, 999); if (d > t) return 'after'; }
    return 'ok';
}

// ═══════════════════════════════════════════════════════════
//  BROWSER HELPERS
// ═══════════════════════════════════════════════════════════
async function newBrowser() {
    return chromium.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
}

async function dismissConsent(page) {
    const btns = [
        '#onetrust-accept-btn-handler', 'button[id*="accept"]',
        'button:has-text("Accept all")', 'button:has-text("Accept All")',
        'button:has-text("Accept")', 'button:has-text("Agree")',
        'button:has-text("I agree")', 'button:has-text("OK")',
        'button:has-text("Got it")', 'button:has-text("Close")',
        '[data-gdpr-consent="accept"]',
    ];
    for (const sel of btns) {
        try {
            const el = page.locator(sel).first();
            if (await el.isVisible({ timeout: 1500 })) {
                await el.click();
                await page.waitForTimeout(800);
                return;
            }
        } catch { }
    }
}

// ═══════════════════════════════════════════════════════════
//  BOOKING.COM  (Stable Extraction)
// ═══════════════════════════════════════════════════════════
async function scrapeBooking(socket, dateFrom, dateTo, hotelUrl) {
    const reviews = [];
    const browser = await newBrowser();
    try {
        const ctx = await browser.newContext({ locale: 'en-GB', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36' });
        const page = await ctx.newPage();

        let baseUrl = (hotelUrl || DEFAULT_URLS.booking).trim();
        baseUrl = baseUrl.replace(/[?&]$/, '');
        const initialUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'tab=reviews';

        socket.emit('site_status', { site: 'booking', msg: 'Navigating to hotel page...' });
        await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);
        await dismissConsent(page);

        // Improved Hotel ID extraction
        const hotelId = await page.evaluate(() => {
            // 1. Data attribute
            const el = document.querySelector('[data-hotel-id], [data-hotelkey]');
            if (el) return el.getAttribute('data-hotel-id') || el.getAttribute('data-hotelkey');
            
            // 2. Global JS variable
            if (window.booking && window.booking.env && window.booking.env.hotel_id) return window.booking.env.hotel_id;
            if (window.b_hotel_id) return window.b_hotel_id;
            
            // 3. Regex on HTML
            const match = document.documentElement.innerHTML.match(/(?:hotel_id|hotelKey)["']?\s*[:=]\s*["']?(\d+)["']?/i);
            return match ? match[1] : null;
        });

        if (hotelId) {
            socket.emit('site_status', { site: 'booking', msg: `Detected Hotel ID: ${hotelId}` });
        }

        let useDirect = !!hotelId;
        let pageNum = 1;
        let offset = 0;
        let stop = false;

        while (!stop && pageNum <= 500) {
            socket.emit('site_status', { site: 'booking', msg: `Page ${pageNum} — ${reviews.length} total reviews fetched...` });

            if (useDirect) {
                // Direct list URL with full parameters for stability
                const listUrl = `https://www.booking.com/reviewlist.html?hotel_id=${hotelId}&sort=f_recent_desc&offset=${offset}&rows=25&lang=en-gb`;
                await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
                await page.waitForTimeout(2000);
            } else if (pageNum === 1) {
                // In UI fallback, if we are on page 1, we MUST open the full reviews modal/page
                // Otherwise Booking only shows the first 10 featured reviews
                try {
                    const readAllBtn = page.locator('button:has-text("Read all reviews"), a:has-text("Read all reviews"), .hp_nav_reviews_link, a[data-testid="reviews-link"]').first();
                    if (await readAllBtn.isVisible({ timeout: 5000 })) {
                        await readAllBtn.click();
                        await page.waitForTimeout(3000);
                        await dismissConsent(page);
                    }
                } catch (e) {
                    console.log("[booking] Read all reviews button info:", e.message);
                }
            }

            // Wait for review cards/blocks
            try {
                // Try multiple selectors including the mobile/new layout ones
                await page.waitForSelector('[data-testid="review-card"], .c-review-block, .review_list_new_item_block, .review_item, [class*="ReviewCard"]', { timeout: 15000 });
            } catch {
                if (useDirect) {
                    console.log('[booking] Direct mode failed to find cards. Falling back to UI mode...');
                    socket.emit('site_status', { site: 'booking', msg: 'Primary method failed. Switching to browsing mode...' });
                    useDirect = false;
                    await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    continue; 
                } else {
                    socket.emit('site_status', { site: 'booking', msg: 'No more reviews detected.' });
                    break;
                }
            }

            const rawCards = await page.evaluate(() => {
                const selectors = ['[data-testid="review-card"]', '.c-review-block', '.review_list_new_item_block', '.review_item', '[class*="ReviewCard"]'];
                let cards = [];
                for (const sel of selectors) {
                    cards = [...document.querySelectorAll(sel)];
                    if (cards.length > 0) break;
                }

                return cards.map(card => {
                    const get = (sels) => {
                        for (const s of sels) {
                            const el = card.querySelector(s);
                            if (el && el.innerText.trim()) return el.innerText.trim();
                        }
                        return '';
                    };
                    return {
                        reviewerName: get(['[data-testid="review-avatar"] + div [class*="title"]', '[data-testid="review-avatar"] + div span', '.bui-avatar-block__title', '.reviewer_name', '[class*="ReviewerName"]']),
                        nationality: get(['[data-testid="review-avatar-flag"] ~ span', '.bui-avatar-block__subtitle', '.reviewer_country span', '[class*="ReviewerCountry"]']),
                        date: get(['[data-testid="review-date"]', '.c-review-block__date', '.review_item_date', '[class*="ReviewDate"]']),
                        rating: get(['[data-testid="review-score"]', '.bui-review-score__badge', '.review-score-badge', '[class*="ReviewScore"]']),
                        title: get(['[data-testid="review-title"]', '.c-review-block__title', '.review_item_header_content', '[class*="ReviewTitle"]']),
                        positive: get(['[data-testid="review-positive-text"]', '.review_pos span', '.c-review__body p', 'span[data-testid="review-body-text"]', '[class*="ReviewBody"]']),
                        negative: get(['[data-testid="review-negative-text"]', '.review_neg span', '[class*="ReviewNegative"]']),
                        roomType: get(['[data-testid="review-room-info"]', '.c-review-block__room', '.review_item_room_info', '[class*="RoomInfo"]']),
                        tripType: get(['[data-testid="review-traveler-type"]', '.c-review-block__travel-type', '.review_item_info_tags', '[class*="TravelerType"]']),
                    };
                });
            });

            if (rawCards.length === 0) break;

            for (const r of rawCards) {
                const reviewText = [r.positive, r.negative].filter(Boolean).join(' | ');
                const chk = inRange(r.date, dateFrom, dateTo);
                if (chk === 'before') { stop = true; break; }
                if (chk === 'after') continue;
                reviews.push({ site: 'Booking.com', ...r, reviewText, scrapedAt: new Date().toISOString() });
                socket.emit('new_review', { site: 'booking', review: reviews[reviews.length - 1] });
            }

            if (stop) break;

            if (useDirect) {
                offset += 25;
                pageNum++;
                // Check if we hit a likely end (very few reviews on the page)
                if (rawCards.length < 5) break; 
            } else {
                const nextBtn = page.locator('button[aria-label="Next page"], a[aria-label="Next page"], [data-testid="pagination-next"], .ui_pagination_next').first();
                if (await nextBtn.isVisible({ timeout: 5000 })) {
                    await nextBtn.scrollIntoViewIfNeeded();
                    await nextBtn.click({ force: true });
                    await page.waitForTimeout(4000);
                    pageNum++;
                } else break;
            }
        }
    } finally {
        await browser.close();
    }
    return reviews;
}

// ═══════════════════════════════════════════════════════════
//  TRIPADVISOR
// ═══════════════════════════════════════════════════════════
async function scrapeTripadvisor(socket, dateFrom, dateTo, hotelUrl) {
    const reviews = [];
    const browser = await newBrowser();
    try {
        const ctx = await browser.newContext({ locale: 'en-US', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36' });
        const page = await ctx.newPage();
        await page.goto(hotelUrl || DEFAULT_URLS.tripadvisor, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);
        await dismissConsent(page);

        let pageNum = 1;
        let stop = false;

        while (!stop && pageNum <= 100) {
            socket.emit('site_status', { site: 'tripadvisor', msg: `Page ${pageNum} — ${reviews.length} reviews...` });
            
            // Expand all "Read more" buttons
            try {
                const moreButtons = page.locator('button:has-text("Read more"), span:has-text("More"), [data-test-target="expand-review"]');
                const cnt = await moreButtons.count();
                for (let i = 0; i < cnt; i++) {
                    await moreButtons.nth(i).click({ timeout: 1000 }).catch(() => null);
                }
            } catch { }

            const rawCards = await page.evaluate(() => {
                let cards = [...document.querySelectorAll('[data-test-target="HR_CC_CARD"]')];
                if (!cards.length) cards = [...document.querySelectorAll('[data-reviewid]')];
                return cards.map(card => {
                    const get = (sels) => {
                        for (const s of sels) {
                            const el = card.querySelector(s);
                            if (el && el.innerText.trim()) return el.innerText.trim();
                        }
                        return '';
                    };
                    return {
                        reviewerName: get(['a[href*="Profile"]', '.info_text a', '[class*="username"]']),
                        nationality: get(['.userLoc span', '[class*="userLocation"]']),
                        date: get(['.ratingDate', '[class*="date"]', 'span[data-date-string]']),
                        rating: '', // Simplified for this pass
                        title: get(['.noQuotes', '[class*="title"]', 'a.title']),
                        reviewText: get(['q', 'p.partial_entry', '[class*="reviewText"]']),
                        tripType: get(['.recommend-titleInline', '[class*="tripType"]']),
                    };
                });
            });

            if (rawCards.length === 0) break;

            for (const r of rawCards) {
                const chk = inRange(r.date, dateFrom, dateTo);
                if (chk === 'before') { stop = true; break; }
                if (chk === 'after') continue;
                if (!r.reviewerName && !r.reviewText) continue;
                reviews.push({ site: 'Tripadvisor.com', ...r, scrapedAt: new Date().toISOString() });
                socket.emit('new_review', { site: 'tripadvisor', review: reviews[reviews.length - 1] });
            }

            if (stop) break;

            const nextBtn = page.locator('a[data-page-number].next, a.ui_button.next, a:has-text("Next"), button[aria-label="Next page"]').first();
            if (await nextBtn.isVisible({ timeout: 5000 })) {
                const href = await nextBtn.getAttribute('href');
                if (href && href !== '#') {
                    const nextUrl = href.startsWith('http') ? href : 'https://www.tripadvisor.com' + href;
                    await page.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                } else {
                    await nextBtn.click();
                    await page.waitForLoadState('domcontentloaded');
                }
                pageNum++;
            } else break;
        }
    } finally {
        await browser.close();
    }
    return reviews;
}

// ═══════════════════════════════════════════════════════════
//  AGODA
// ═══════════════════════════════════════════════════════════
async function scrapeAgoda(socket, dateFrom, dateTo, hotelUrl) {
    const reviews = [];
    const browser = await newBrowser();
    try {
        const ctx = await browser.newContext({ locale: 'en-US', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36' });
        const page = await ctx.newPage();
        await page.goto(hotelUrl || DEFAULT_URLS.agoda, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);
        await dismissConsent(page);

        let pageNum = 1;
        let stop = false;

        while (!stop && pageNum <= 100) {
            socket.emit('site_status', { site: 'agoda', msg: `Page ${pageNum} — ${reviews.length} reviews...` });
            await page.waitForTimeout(2000);

            const rawCards = await page.evaluate(() => {
                let cards = [...document.querySelectorAll('[data-info-type="review-card"], .Review-comment')];
                return cards.map(card => {
                    const get = (sels) => {
                        for (const s of sels) {
                            const el = card.querySelector(s);
                            if (el && el.innerText.trim()) return el.innerText.trim();
                        }
                        return '';
                    };
                    return {
                        reviewerName: get(['[class*="reviewer-name"]', '.Review-comment-reviewer']),
                        nationality: get(['[class*="reviewer-country"]', '.Review-comment-reviewer__country']),
                        date: get(['[class*="review-date"]', '.Review-comment-date']),
                        rating: get(['[class*="review-score"]', '.Review-comment-leftScore']),
                        title: get(['[class*="review-title"]', '.Review-comment-bodyTitle']),
                        reviewText: get(['[class*="review-comment"]', '.Review-comment-bodyText']),
                    };
                });
            });

            if (rawCards.length === 0) break;

            for (const r of rawCards) {
                const chk = inRange(r.date, dateFrom, dateTo);
                if (chk === 'before') { stop = true; break; }
                if (chk === 'after') continue;
                reviews.push({ site: 'Agoda.com', ...r, scrapedAt: new Date().toISOString() });
                socket.emit('new_review', { site: 'agoda', review: reviews[reviews.length - 1] });
            }

            if (stop) break;

            const nextBtn = page.locator('[data-element-name="review-next-page"], button:has-text("Next"), .Review-paginataion-next').first();
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

// ═══════════════════════════════════════════════════════════
//  EXPEDIA / HOTELS.COM
// ═══════════════════════════════════════════════════════════
async function scrapeExpediaLike(siteKey, socket, dateFrom, dateTo, hotelUrl) {
    const reviews = [];
    const browser = await newBrowser();
    try {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();
        await page.goto(hotelUrl || DEFAULT_URLS[siteKey], { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);
        await dismissConsent(page);

        let pageNum = 1;
        let stop = false;

        while (!stop && pageNum <= 100) {
            socket.emit('site_status', { site: siteKey, msg: `Page ${pageNum} — ${reviews.length} reviews...` });
            await page.waitForTimeout(2000);

            const rawCards = await page.evaluate(() => {
                let cards = [...document.querySelectorAll('[data-stid="review-card"]')];
                return cards.map(card => {
                    const get = (sels) => {
                        for (const s of sels) {
                            const el = card.querySelector(s);
                            if (el && el.innerText.trim()) return el.innerText.trim();
                        }
                        return '';
                    };
                    return {
                        reviewerName: get(['[class*="userName"]', '[class*="reviewer"]']),
                        date: get(['[class*="reviewDate"]', 'time']),
                        rating: get(['[class*="ratingNumber"]']),
                        title: get(['h3', 'h4', '[class*="title"]']),
                        reviewText: get(['[class*="reviewText"]', 'p']),
                    };
                });
            });

            if (rawCards.length === 0) break;

            for (const r of rawCards) {
                const chk = inRange(r.date, dateFrom, dateTo);
                if (chk === 'before') { stop = true; break; }
                if (chk === 'after') continue;
                reviews.push({ site: SITE_CONFIGS[siteKey].name, ...r, scrapedAt: new Date().toISOString() });
                socket.emit('new_review', { site: siteKey, review: reviews[reviews.length - 1] });
            }

            if (stop) break;

            const nextBtn = page.locator('button:has-text("Next"), [data-stid="pagination-next"]').first();
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

// ═══════════════════════════════════════════════════════════
//  REGISTRY & SERVER
// ═══════════════════════════════════════════════════════════
async function runScraper(siteKey, socket, dateFrom, dateTo, hotelUrl) {
    switch (siteKey) {
        case 'booking': return scrapeBooking(socket, dateFrom, dateTo, hotelUrl);
        case 'tripadvisor': return scrapeTripadvisor(socket, dateFrom, dateTo, hotelUrl);
        case 'agoda': return scrapeAgoda(socket, dateFrom, dateTo, hotelUrl);
        case 'expedia': return scrapeExpediaLike('expedia', socket, dateFrom, dateTo, hotelUrl);
        case 'hotels': return scrapeExpediaLike('hotels', socket, dateFrom, dateTo, hotelUrl);
        default: throw new Error(`Unknown site: ${siteKey}`);
    }
}

app.get('/api/state', (req, res) => res.json(loadState()));
app.get('/api/reviews/:site', (req, res) => {
    const { site } = req.params;
    if (!SITE_CONFIGS[site]) return res.status(404).json({ error: 'Unknown site' });
    res.json(loadReviews(site));
});
app.get('/api/all-reviews', (req, res) => {
    const all = [];
    for (const k of Object.keys(SITE_CONFIGS)) all.push(...loadReviews(k));
    res.json(all);
});

io.on('connection', (socket) => {
    console.log('🔌 Client connected');
    socket.emit('scrape_state', loadState());

    socket.on('start_scrape', async ({ sites, mode, dateFrom, dateTo }) => {
        const selected = sites?.length ? sites : Object.keys(SITE_CONFIGS);
        const fileUrls = loadHotelUrls();
        const state = loadState();

        for (const siteKey of selected) {
            socket.emit('site_progress', { site: siteKey, status: 'running' });
            
            let effectiveDateFrom = dateFrom;
            let effectiveDateTo = dateTo;

            if (mode === 'all') {
                effectiveDateFrom = null; effectiveDateTo = null;
            } else if (mode === 'new') {
                if (state[siteKey]?.lastScrapedAt) effectiveDateFrom = state[siteKey].lastScrapedAt.split('T')[0];
            }

            let hotelUrl = fileUrls[siteKey] || DEFAULT_URLS[siteKey] || null;
            hotelUrl = normalizeUrl(hotelUrl);

            try {
                const newReviews = await runScraper(siteKey, socket, effectiveDateFrom, effectiveDateTo, hotelUrl);
                const existing = loadReviews(siteKey);
                const keySet = new Set(existing.map(r => `${r.reviewerName}|${r.date}|${r.title}`));
                const unique = newReviews.filter(r => !keySet.has(`${r.reviewerName}|${r.date}|${r.title}`));
                const merged = [...existing, ...unique];
                saveReviews(siteKey, merged);

                let lastReviewDate = state[siteKey]?.lastReviewDate || '';
                for (const r of unique) if (r.date && r.date > lastReviewDate) lastReviewDate = r.date;

                const newState = updateSiteState(siteKey, lastReviewDate, merged.length);
                socket.emit('scrape_state', newState);
                socket.emit('site_status', { site: siteKey, msg: `✅ Done! ${unique.length} new reviews.` });
                socket.emit('site_progress', { site: siteKey, status: 'done', count: merged.length, newCount: unique.length });
            } catch (err) {
                console.error(`[${siteKey}] Error:`, err.message);
                socket.emit('site_status', { site: siteKey, msg: `❌ Error: ${err.message}` });
                socket.emit('site_progress', { site: siteKey, status: 'error' });
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`🏨  Hotel Review Scraper — http://localhost:${PORT}`);
    console.log(`📂  Data saved to: ${path.resolve(DATA_DIR)}`);
});
