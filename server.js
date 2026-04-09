import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const EMPTY_PHRASES = [
    'there are no comments available for this review',
    'no comments', 'no comment', 'n/a', 'none',
];
const cleanField = (str) => {
    if (!str) return '';
    const t = str.trim();
    return EMPTY_PHRASES.some(p => t.toLowerCase().includes(p)) ? '' : t;
};

const app = express();
const server = createServer(app);
const io = new Server(server);
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

const DATA_DIR = './data';
const STATE_FILE = path.join(DATA_DIR, 'scrape_state.json');
const URLS_FILE = path.join(DATA_DIR, 'hotel_urls.json');

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
//  BOOKING.COM
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

        socket.emit('site_status', { site: 'booking', msg: 'Finding Hotel ID...' });
        await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);
        await dismissConsent(page);

        // Extract both hotel_id and pagename (fallback)
        const hotelData = await page.evaluate(() => {
            const idEl = document.querySelector('[data-hotel-id]');
            const hotel_id = idEl?.getAttribute('data-hotel-id')
                || (document.documentElement.innerHTML.match(/hotel_id["']?\s*[:=]\s*["']?(\d+)/i) || [])[1];

            const urlMatch = location.href.match(/\/hotel\/([a-z]{2})\/([^.]+)\./);
            const cc1 = urlMatch ? urlMatch[1] : null;
            const pagename = urlMatch ? urlMatch[2] : null;

            return { hotel_id, cc1, pagename };
        });

        if (hotelData.hotel_id) {
            socket.emit('site_status', { site: 'booking', msg: `Found Hotel ID: ${hotelData.hotel_id}` });
        } else if (hotelData.pagename) {
            socket.emit('site_status', { site: 'booking', msg: `Found Pagename: ${hotelData.pagename}` });
        }

        let pageNum = 1;
        let offset = 0;
        let stop = false;

        while (!stop && pageNum <= 500) {
            socket.emit('site_status', { site: 'booking', msg: `Page ${pageNum} — ${reviews.length} total fetched...` });

            let listUrl;
            if (hotelData.hotel_id) {
                listUrl = `https://www.booking.com/reviewlist.html?hotel_id=${hotelData.hotel_id}&sort=f_recent_desc&offset=${offset}&rows=25&lang=en-gb`;
            } else if (hotelData.pagename) {
                listUrl = `https://www.booking.com/reviewlist.html?cc1=${hotelData.cc1}&pagename=${hotelData.pagename}&sort=f_recent_desc&offset=${offset}&rows=25&lang=en-gb`;
            }

            if (listUrl) {
                await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
            }

            try {
                await page.waitForSelector('[data-testid="review-card"], .c-review-block, .review_list_new_item_block, .review_item', { timeout: 15000 });
            } catch {
                break;
            }

            const rawCards = await page.evaluate(() => {
                const CARD_SELS = ['[data-testid="review-card"]', '.c-review-block', '.review_list_new_item_block', '.review_item'];
                let allNodes = [];
                for (const sel of CARD_SELS) {
                    const found = [...document.querySelectorAll(sel)];
                    if (found.length) { allNodes = found; break; }
                }
                if (!allNodes.length) return [];

                const gt = el => el ? (el.innerText || el.textContent || '').trim() : '';
                const get = (card, sels) => { for (const s of sels) { const t = gt(card.querySelector(s)); if (t) return t; } return ''; };

                const getSection = (card, type) => {
                    const testIds = type === 'positive'
                        ? ['[data-testid="review-positive-text"]', '[data-testid="review-positive"]', '[data-testid="review-body-positive"]']
                        : ['[data-testid="review-negative-text"]', '[data-testid="review-negative"]', '[data-testid="review-body-negative"]'];
                    for (const s of testIds) { const t = gt(card.querySelector(s)); if (t) return t; }

                    const cls = type === 'positive'
                        ? ['.c-review__body--positive', '.review_pros', '.review_pos']
                        : ['.c-review__body--negative', '.review_cons', '.review_neg'];
                    for (const s of cls) { const t = gt(card.querySelector(s)); if (t) return t; }

                    const lis = [...card.querySelectorAll('ul.review-text-list li, .c-review__row')];
                    if (lis.length >= 2) {
                        const li = lis[type === 'positive' ? 0 : 1];
                        if (li) { const p = li.querySelector('p, span:not([class*="icon"])'); return gt(p || li); }
                    }

                    const iconEl = card.querySelector(`.icon-review-${type === 'positive' ? 'pos' : 'neg'}`);
                    if (iconEl) {
                        const par = iconEl.closest('li') || iconEl.closest('p') || iconEl.parentElement;
                        if (par) return gt(par.querySelector('p, span') || par);
                    }

                    for (const li of card.querySelectorAll('li')) {
                        const use = li.querySelector('svg use');
                        if (!use) continue;
                        const href = (use.getAttribute('href') || use.getAttribute('xlink:href') || '').toLowerCase();
                        const match = type === 'positive' ? /pos|thumb.*up|like|good/.test(href) : /neg|thumb.*down|dislike|bad/.test(href);
                        if (match) return gt(li.querySelector('p, span') || li);
                    }
                    return '';
                };

                return allNodes.map(card => {
                    const positive = getSection(card, 'positive');
                    const negative = getSection(card, 'negative');
                    const body = get(card, ['[itemprop="reviewBody"]', '.c-review__body', '.review_item_main_content', 'span[data-testid="review-body-text"]']);
                    return {
                        reviewerName: get(card, ['.bui-avatar-block__title', '[data-testid="review-avatar"] + div span', '.reviewer_name']),
                        nationality: get(card, ['.bui-avatar-block__subtitle', '[data-testid="review-avatar-flag"] ~ span', '.reviewer_country']),
                        date: get(card, ['[data-testid="review-date"]', '.c-review-block__date', '.review_item_date']),
                        rating: get(card, ['[data-testid="review-score"]', '.bui-review-score__badge', '.review-score-badge']),
                        title: get(card, ['[data-testid="review-title"]', '.c-review-block__title', '.review_item_header_content']),
                        positive, negative, body,
                        roomType: get(card, ['[data-testid="review-room-info"]', '.c-review-block__room-info', '.review_item_room_info']),
                        tripType: get(card, ['[data-testid="review-traveler-type"]', '.c-review-block__traveler-type', '.review_item_info_tags li:first-child']),
                    };
                });
            });

            if (rawCards.length === 0) break;

            for (const r of rawCards) {
                const positive = cleanField(r.positive);
                const negative = cleanField(r.negative);
                const body = cleanField(r.body);
                const reviewText = (positive || negative)
                    ? [positive, negative].filter(Boolean).join(' | ')
                    : body;

                const chk = inRange(r.date, dateFrom, dateTo);
                if (chk === 'before') { stop = true; break; }
                if (chk === 'after') continue;

                reviews.push({ site: 'Booking.com', ...r, positive, negative, reviewText, scrapedAt: new Date().toISOString() });
                socket.emit('new_review', { site: 'booking', review: reviews[reviews.length - 1] });
            }

            if (stop) break;
            offset += 25;
            pageNum++;
            if (rawCards.length < 5) break;
        }
    } finally {
        await browser.close();
    }
    return reviews;
}

// ═══════════════════════════════════════════════════════════
//  TRIPADVISOR (2025 Selectors)
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

        while (!stop && pageNum <= 500) {
            socket.emit('site_status', { site: 'tripadvisor', msg: `Page ${pageNum} — ${reviews.length} reviews...` });

            const rawCards = await page.evaluate(() => {
                // ✅ 2025 TripAdvisor Selectors
                let cards = [...document.querySelectorAll('[data-automation="reviewCard"]')];
                if (!cards.length) cards = [...document.querySelectorAll('div[class*="ReviewCard"]')];
                if (!cards.length) cards = [...document.querySelectorAll('[class*="review-container"]')];

                return cards.map(card => {
                    const get = (sels) => {
                        for (const s of sels) {
                            const el = card.querySelector(s);
                            if (el && el.innerText.trim()) return el.innerText.trim();
                        }
                        return '';
                    };

                    // Star rating extraction
                    let rating = '';
                    const ratingEl = card.querySelector('[class*="ui_bubble_rating"], [class*="bubble_rating"], span[class*="ratings"]');
                    if (ratingEl) {
                        const cls = ratingEl.className || '';
                        const m = cls.match(/bubble_(\d+)/);
                        if (m) rating = (parseInt(m[1]) / 10).toFixed(1);
                    }

                    return {
                        reviewerName: get(['a[href*="Profile"]', '.info_text a', '[class*="username"]', '[class*="memberName"]']),
                        nationality: get(['.userLoc span', '[class*="userLocation"]']),
                        date: get(['.ratingDate', '[class*="date"]', 'span[data-date-string]']),
                        rating: rating,
                        title: get(['.noQuotes', '[class*="title"]', 'a.title', 'span[class*="ReviewTitle"]']),
                        reviewText: get(['q', 'p.partial_entry', '[class*="reviewText"]', 'span[class*="ReviewText"]']),
                        tripType: get(['.recommend-titleInline', '[class*="tripType"]']),
                    };
                });
            });

            if (rawCards.length === 0) break;

            for (const r of rawCards) {
                const chk = inRange(r.date, dateFrom, dateTo);
                if (chk === 'before') { stop = true; break; }
                if (chk === 'after') continue;
                reviews.push({ site: 'Tripadvisor.com', ...r, scrapedAt: new Date().toISOString() });
                socket.emit('new_review', { site: 'tripadvisor', review: reviews[reviews.length - 1] });
            }

            if (stop) break;

            const nextBtn = page.locator('a[data-page-number].next, a.ui_button.next, a:has-text("Next"), button[aria-label="Next page"]').first();
            if (await nextBtn.isVisible({ timeout: 5000 })) {
                await nextBtn.click();
                await page.waitForLoadState('domcontentloaded');
                await page.waitForTimeout(3000);
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

        while (!stop && pageNum <= 500) {
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
//  EXPEDIA / HOTELS.COM (Clean standalone page navigation)
// ═══════════════════════════════════════════════════════════
async function scrapeExpediaLike(siteKey, socket, dateFrom, dateTo, hotelUrl) {
    const reviews = [];
    const browser = await newBrowser();
    try {
        const ctx = await browser.newContext({ locale: 'en-US' });
        const page = await ctx.newPage();

        // Clean URL — strip dialog parameters
        const cleanUrl = hotelUrl.split('?')[0];
        socket.emit('site_status', { site: siteKey, msg: `Opening ${SITE_CONFIGS[siteKey].name}...` });
        await page.goto(cleanUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(4000);
        await dismissConsent(page);

        // Explicitly click "See all reviews" to get past 10-review limit
        try {
            const reviewsBtn = page.locator('button:has-text("See all reviews"), a:has-text("See all reviews")').first();
            if (await reviewsBtn.isVisible({ timeout: 5000 })) {
                await reviewsBtn.click();
                await page.waitForTimeout(3000);
            }
        } catch { }

        let pageNum = 1;
        let stop = false;

        while (!stop && pageNum <= 500) {
            socket.emit('site_status', { site: siteKey, msg: `Page ${pageNum} — ${reviews.length} reviews...` });
            await page.waitForTimeout(2000);

            const rawCards = await page.evaluate(() => {
                // ✅ 2025 Expedia Selectors
                let cards = [...document.querySelectorAll('[itemprop="review"], [data-stid="reviews-expand"], [class*="ReviewItem"]')];
                return cards.map(card => {
                    const get = (sels) => {
                        for (const s of sels) {
                            const el = card.querySelector(s);
                            if (el && el.innerText.trim()) return el.innerText.trim();
                        }
                        return '';
                    };
                    return {
                        reviewerName: get(['[itemprop="author"]', '[class*="userName"]']),
                        date: get(['[itemprop="datePublished"]', 'time']),
                        rating: get(['[class*="ratingNumber"]']),
                        title: get(['h3', 'h4', '[class*="title"]']),
                        reviewText: get(['[itemprop="description"]', 'p']),
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

                // Helper to create a unique fingerprint for a review
                const getFprint = (r) => `${r.reviewerName}|${r.date}|${r.title}|${(r.reviewText || '').slice(0, 150)}`.toLowerCase().replace(/\s+/g, '');

                const keySet = new Set(existing.map(getFprint));
                const unique = newReviews.filter(r => {
                    const fp = getFprint(r);
                    if (keySet.has(fp)) return false;
                    keySet.add(fp);
                    return true;
                });

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

    // One-time startup cleanup of duplicates in all files
    Object.keys(SITE_CONFIGS).forEach(siteKey => {
        const reviews = loadReviews(siteKey);
        if (reviews.length > 0) {
            const getFprint = (r) => `${r.reviewerName}|${r.date}|${r.title}|${(r.reviewText || '').slice(0, 150)}`.toLowerCase().replace(/\s+/g, '');
            const seen = new Set();
            const clean = reviews.filter(r => {
                const fp = getFprint(r);
                if (seen.has(fp)) return false;
                seen.add(fp);
                return true;
            });
            if (clean.length !== reviews.length) {
                console.log(`[cleanup] Removed ${reviews.length - clean.length} duplicates from ${SITE_CONFIGS[siteKey].name}`);
                saveReviews(siteKey, clean);
            }
        }
    });
});
