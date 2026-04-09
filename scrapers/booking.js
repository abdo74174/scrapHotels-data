import { chromium } from 'playwright';
import fs from 'fs';
import { config, userAgents, randomDelay } from '../config.js';

// Booking.com placeholder text — treat as empty
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
    const site = 'Booking.com';
    const reviews = [];
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
        viewport: { width: 1280, height: 720 },
        locale: 'en-GB',
    });

    try {
        const page = await context.newPage();
        const url = hotelUrl || config.urls.booking;

        const pagenameMatch = url.match(/\/hotel\/([a-z]{2})\/([^.]+)\./);
        if (!pagenameMatch) throw new Error('Could not extract pagename from Booking URL');

        const cc1 = pagenameMatch[1];
        const pagename = pagenameMatch[2];

        console.log(`[${site}] Starting scrape for ${pagename}...`);

        let offset = 0;
        let pageNum = 1;

        while (pageNum <= (options.maxPages || config.options.maxPages)) {
            const listUrl = `https://www.booking.com/reviewlist.html?cc1=${cc1}&pagename=${pagename}&sort=f_recent_desc&offset=${offset}&rows=25&lang=en-gb`;
            console.log(`[${site}] Fetching page ${pageNum} (offset ${offset})...`);

            await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(2000);

            try {
                await page.waitForSelector(
                    '[data-testid="review-card"], .c-review-block, .review_list_new_item_block, .review_item',
                    { timeout: 15000 }
                );
            } catch {
                console.log(`[${site}] No cards appeared — stopping.`);
                break;
            }

            const rawCards = await page.evaluate(() => {
                const CARD_SELS = [
                    '[data-testid="review-card"]',
                    '.c-review-block',
                    '.review_list_new_item_block',
                    '.review_item',
                ];

                let allNodes = [];
                for (const sel of CARD_SELS) {
                    const found = [...document.querySelectorAll(sel)];
                    if (found.length) { allNodes = found; break; }
                }

                if (!allNodes.length) return [];

                const gt = el => el ? (el.innerText || el.textContent || '').trim() : '';

                const get = (card, sels) => {
                    for (const s of sels) {
                        const el = card.querySelector(s);
                        const t = gt(el);
                        if (t) return t;
                    }
                    return '';
                };

                const getSection = (card, type) => {
                    // Strategy 1: data-testid
                    const testIds = type === 'positive'
                        ? ['[data-testid="review-positive-text"]', '[data-testid="review-positive"]', '[data-testid="review-body-positive"]']
                        : ['[data-testid="review-negative-text"]', '[data-testid="review-negative"]', '[data-testid="review-body-negative"]'];
                    for (const s of testIds) {
                        const t = gt(card.querySelector(s));
                        if (t) return t;
                    }

                    // Strategy 2: BEM class names
                    const classSels = type === 'positive'
                        ? ['.c-review__body--positive', '.review_pros', '.review_pos']
                        : ['.c-review__body--negative', '.review_cons', '.review_neg'];
                    for (const s of classSels) {
                        const t = gt(card.querySelector(s));
                        if (t) return t;
                    }

                    // Strategy 3: review-text-list (2024+ markup)
                    // Booking uses <ul class="review-text-list"> with 2 <li> items:
                    // first = positive (thumbs up), second = negative (thumbs down)
                    const listItems = [...card.querySelectorAll('ul.review-text-list li, .c-review__row')];
                    if (listItems.length >= 2) {
                        const li = listItems[type === 'positive' ? 0 : 1];
                        if (li) {
                            const p = li.querySelector('p, span:not([class*="icon"])');
                            const t = gt(p || li);
                            if (t) return t;
                        }
                    }

                    // Strategy 4: icon class adjacent text
                    const iconCls = type === 'positive' ? 'icon-review-pos' : 'icon-review-neg';
                    const iconEl = card.querySelector(`.${iconCls}`);
                    if (iconEl) {
                        const parent = iconEl.closest('li') || iconEl.closest('p') || iconEl.parentElement;
                        if (parent) {
                            const sub = parent.querySelector('p, span');
                            return gt(sub || parent);
                        }
                    }

                    // Strategy 5: SVG use href keywords
                    for (const li of card.querySelectorAll('li')) {
                        const use = li.querySelector('svg use');
                        if (!use) continue;
                        const href = (use.getAttribute('href') || use.getAttribute('xlink:href') || '').toLowerCase();
                        const isPos = /pos|thumb.*up|like|good/.test(href);
                        const isNeg = /neg|thumb.*down|dislike|bad/.test(href);
                        if ((type === 'positive' && isPos) || (type === 'negative' && isNeg)) {
                            const p = li.querySelector('p, span');
                            return gt(p || li);
                        }
                    }

                    // Strategy 6: aria-label
                    const ariaEl = card.querySelector(`[aria-label*="${type}" i] p, [aria-label*="${type}" i] span`);
                    if (ariaEl) return gt(ariaEl);

                    return '';
                };

                return allNodes.map(card => {
                    const positive = getSection(card, 'positive');
                    const negative = getSection(card, 'negative');
                    const body = get(card, [
                        '[itemprop="reviewBody"]',
                        '.c-review__body',
                        '.review_item_main_content',
                        'span[data-testid="review-body-text"]',
                    ]);

                    return {
                        reviewerName: get(card, ['.bui-avatar-block__title', '[data-testid="review-avatar"] + div span', '.reviewer_name']),
                        nationality: get(card, ['.bui-avatar-block__subtitle', '[data-testid="review-avatar-flag"] ~ span', '.reviewer_country']),
                        date: get(card, ['[data-testid="review-date"]', '.c-review-block__date', '.review_item_date']),
                        rating: get(card, ['[data-testid="review-score"]', '.bui-review-score__badge', '.review-score-badge']),
                        title: get(card, ['[data-testid="review-title"]', '.c-review-block__title', '.review_item_header_content']),
                        positive,
                        negative,
                        body,
                        roomType: get(card, ['[data-testid="review-room-info"]', '.c-review-block__room-info', '.review_item_room_info']),
                        tripType: get(card, ['[data-testid="review-traveler-type"]', '.c-review-block__traveler-type', '.review_item_info_tags li:first-child']),
                    };
                });
            });

            if (rawCards.length === 0) {
                console.log(`[${site}] No reviews found on page ${pageNum} — stopping.`);
                break;
            }

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

            console.log(`[${site}] Page ${pageNum} done — total so far: ${reviews.length}`);
            fs.writeFileSync(config.outputs.booking, JSON.stringify(reviews, null, 2));

            await randomDelay();
            offset += 25;
            pageNum++;
        }

    } catch (err) {
        console.error(`[${site}] Fatal Error:`, err.message);
    } finally {
        await browser.close();
    }

    return reviews;
}

if (process.argv[1].endsWith('booking.js')) {
    const args = process.argv.slice(2);
    const maxPages = args.includes('--maxPages')
        ? parseInt(args[args.indexOf('--maxPages') + 1])
        : undefined;
    run(null, { maxPages }).then(res => console.log(`Finished. Scraped ${res.length} reviews.`));
}