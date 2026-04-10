import { chromium } from 'playwright';
import fs from 'fs';
import { config, userAgents, randomDelay } from '../config.js';

// Booking.com placeholder text — treat as empty
const EMPTY_PHRASES = [
    'there are no comments available for this review',
    'no comments available',
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
                        ? [
                            '[data-testid="review-positive-text"]',
                            '[data-testid="review-positive"]',
                            '[data-testid="review-body-positive"]',
                        ]
                        : [
                            '[data-testid="review-negative-text"]',
                            '[data-testid="review-negative"]',
                            '[data-testid="review-body-negative"]',
                        ];
                    for (const s of testIds) {
                        const el = card.querySelector(s);
                        if (el) {
                            const t = gt(el);
                            if (t) return t;
                        }
                    }

                    // Strategy 2: BEM class names
                    const classSels = type === 'positive'
                        ? ['.c-review__body--positive', '.review_pros', '.review_pos']
                        : ['.c-review__body--negative', '.review_cons', '.review_neg'];
                    for (const s of classSels) {
                        const el = card.querySelector(s);
                        if (el) {
                            const t = gt(el);
                            if (t) return t;
                        }
                    }

                    // Strategy 3: review-text-list (2024+ markup)
                    // Booking uses <ul class="review-text-list"> with 2 <li> items:
                    // first = positive (thumbs up), second = negative (thumbs down)
                    const listItems = [...card.querySelectorAll('ul.review-text-list > li')];
                    if (listItems.length >= 2) {
                        // Exactly index the correct li — do NOT fall through to index 0 when only 1 exists
                        const targetIndex = type === 'positive' ? 0 : 1;
                        const li = listItems[targetIndex];
                        if (li) {
                            const p = li.querySelector('p, span:not([class*="icon"])');
                            const t = gt(p || li);
                            if (t) return t;
                        }
                    } else if (listItems.length === 1 && type === 'positive') {
                        // Only one li present — assign to positive only, never to negative
                        const p = listItems[0].querySelector('p, span:not([class*="icon"])');
                        const t = gt(p || listItems[0]);
                        if (t) return t;
                    }

                    // Strategy 4: c-review__row (alternative list structure)
                    const rowItems = [...card.querySelectorAll('.c-review__row')];
                    if (rowItems.length >= 2) {
                        const targetIndex = type === 'positive' ? 0 : 1;
                        const row = rowItems[targetIndex];
                        if (row) {
                            const p = row.querySelector('p, span:not([class*="icon"])');
                            const t = gt(p || row);
                            if (t) return t;
                        }
                    }

                    // Strategy 5: icon class adjacent text
                    const iconCls = type === 'positive' ? 'icon-review-pos' : 'icon-review-neg';
                    const iconEl = card.querySelector(`.${iconCls}`);
                    if (iconEl) {
                        const parent = iconEl.closest('li') || iconEl.closest('p') || iconEl.parentElement;
                        if (parent) {
                            const sub = parent.querySelector('p, span');
                            const t = gt(sub || parent);
                            if (t) return t;
                        }
                    }

                    // Strategy 6: SVG use href keywords
                    for (const li of card.querySelectorAll('li')) {
                        const use = li.querySelector('svg use');
                        if (!use) continue;
                        const href = (use.getAttribute('href') || use.getAttribute('xlink:href') || '').toLowerCase();
                        const isPos = /pos|thumb.*up|like|good/.test(href);
                        const isNeg = /neg|thumb.*down|dislike|bad/.test(href);
                        if ((type === 'positive' && isPos) || (type === 'negative' && isNeg)) {
                            const p = li.querySelector('p, span');
                            const t = gt(p || li);
                            if (t) return t;
                        }
                    }

                    // Strategy 7: aria-label
                    const ariaEl = card.querySelector(`[aria-label*="${type}" i] p, [aria-label*="${type}" i] span`);
                    if (ariaEl) {
                        const t = gt(ariaEl);
                        if (t) return t;
                    }

                    // Strategy 8: data-review-type attribute (some Booking.com variants)
                    const dataEl = card.querySelector(`[data-review-type="${type}"] p, [data-review-type="${type}"] span`);
                    if (dataEl) {
                        const t = gt(dataEl);
                        if (t) return t;
                    }

                    return '';
                };

                return allNodes.map(card => {
                    const positive = getSection(card, 'positive');
                    const negative = getSection(card, 'negative');

                    // Debug: log raw values to help diagnose DOM structure issues
                    if (typeof console !== 'undefined') {
                        console.log('[DEBUG] RAW positive:', JSON.stringify(positive));
                        console.log('[DEBUG] RAW negative:', JSON.stringify(negative));
                    }

                    const body = get(card, [
                        '[itemprop="reviewBody"]',
                        '.c-review__body',
                        '.review_item_main_content',
                        'span[data-testid="review-body-text"]',
                    ]);

                    return {
                        reviewerName: get(card, [
                            '.bui-avatar-block__title',
                            '[data-testid="review-avatar"] + div span',
                            '.reviewer_name',
                        ]),
                        nationality: get(card, [
                            '.bui-avatar-block__subtitle',
                            '[data-testid="review-avatar-flag"] ~ span',
                            '.reviewer_country',
                        ]),
                        date: get(card, [
                            '[data-testid="review-date"]',
                            '.c-review-block__date',
                            '.review_item_date',
                        ]),
                        rating: get(card, [
                            '[data-testid="review-score"]',
                            '.bui-review-score__badge',
                            '.review-score-badge',
                        ]),
                        title: get(card, [
                            '[data-testid="review-title"]',
                            '.c-review-block__title',
                            '.review_item_header_content',
                        ]),
                        positive,
                        negative,
                        body,
                        roomType: (() => {
                            // Strategy 1: data-testid variants
                            const roomSels = [
                                '[data-testid="review-room-info"]',
                                '[data-testid="room-info"]',
                                '[data-testid="review-stay-info"] [data-testid="room-type"]',
                                '[data-testid="stay-info-room"]',
                            ];
                            for (const s of roomSels) {
                                const t = gt(card.querySelector(s));
                                if (t) return t;
                            }
                            // Strategy 2: BEM class names
                            const classSels = [
                                '.c-review-block__room-info',
                                '.c-review-block__stay-date',
                                '.review_item_room_info',
                                '.review-room-type',
                            ];
                            for (const s of classSels) {
                                const t = gt(card.querySelector(s));
                                if (t) return t;
                            }
                            // Strategy 3: Look for label+value pairs (2024+ Booking markup)
                            // Booking often renders: <li><span>Room type: </span><span>Deluxe Room</span></li>
                            for (const li of card.querySelectorAll('li, .review-info-item')) {
                                const text = gt(li).toLowerCase();
                                if (text.includes('room') || text.includes('stayed in')) {
                                    // Extract the value part (after the label span)
                                    const spans = [...li.querySelectorAll('span')];
                                    if (spans.length >= 2) return gt(spans[spans.length - 1]);
                                    return gt(li);
                                }
                            }
                            // Strategy 4: itemprop
                            const itemprop = card.querySelector('[itemprop="name"][itemtype*="Room"], [itemprop="roomType"]');
                            if (itemprop) return gt(itemprop);
                            return '';
                        })(),
                        tripType: (() => {
                            // Strategy 1: data-testid variants
                            const tripSels = [
                                '[data-testid="review-traveler-type"]',
                                '[data-testid="traveler-type"]',
                                '[data-testid="review-stay-info"] [data-testid="traveler-type"]',
                                '[data-testid="trip-type"]',
                            ];
                            for (const s of tripSels) {
                                const t = gt(card.querySelector(s));
                                if (t) return t;
                            }
                            // Strategy 2: BEM class names
                            const classSels = [
                                '.c-review-block__traveler-type',
                                '.review_item_info_tags li:first-child',
                                '.traveler-type',
                                '.review-traveler-type',
                            ];
                            for (const s of classSels) {
                                const t = gt(card.querySelector(s));
                                if (t) return t;
                            }
                            // Strategy 3: Look for traveler/travel/trip keyword in li elements
                            const TRIP_KEYWORDS = ['couple', 'solo', 'family', 'group', 'business', 'friends', 'travel'];
                            for (const li of card.querySelectorAll('li, .review-info-item')) {
                                const text = gt(li).toLowerCase();
                                if (TRIP_KEYWORDS.some(k => text.includes(k))) {
                                    const spans = [...li.querySelectorAll('span')];
                                    if (spans.length >= 2) return gt(spans[spans.length - 1]);
                                    return gt(li);
                                }
                            }
                            // Strategy 4: info tags list (all items, first non-date one is usually trip type)
                            const infoTags = [...card.querySelectorAll('.review_item_info_tags li, .c-review-block__tags li')];
                            for (const tag of infoTags) {
                                const t = gt(tag);
                                // Skip if it looks like a date (contains a month name or year)
                                if (t && !/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4}/i.test(t)) {
                                    return t;
                                }
                            }
                            return '';
                        })(),
                    };
                });
            });

            if (rawCards.length === 0) {
                console.log(`[${site}] No reviews found on page ${pageNum} — stopping.`);
                break;
            }

            for (const r of rawCards) {
                // FIX: Apply clean() FIRST to raw values before any logic
                const positive = clean(r.positive);
                const negative = clean(r.negative);
                const body = clean(r.body);

                // FIX: Build reviewText from already-cleaned values
                // This ensures placeholder text is stripped before joining
                let reviewText = '';
                if (positive || negative) {
                    reviewText = [positive, negative].filter(Boolean).join(' | ');
                } else if (body) {
                    reviewText = body;
                }

                reviews.push({
                    site,
                    reviewerName: r.reviewerName || '',
                    nationality: r.nationality || '',
                    date: r.date || '',
                    rating: r.rating || '',
                    title: r.title || '',
                    positive,
                    negative,
                    reviewText,
                    roomType: r.roomType || '',
                    tripType: r.tripType || '',
                    scrapedAt: new Date().toISOString(),
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