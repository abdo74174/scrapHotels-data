export async function parseBookingPage(page, selectors, keywords) {
    return page.evaluate(({ SELECTORS, TRIP_KEYWORDS }) => {
        const gt = el => el ? (el.innerText || el.textContent || '').trim() : '';
        const get = (card, sels) => { for (const s of sels) { const t = gt(card.querySelector(s)); if (t) return t; } return ''; };

        const getSection = (card, type) => {
            // Strategy 1: data-testid
            const testIds = type === 'positive' ? SELECTORS.POSITIVE_TEST_IDS : SELECTORS.NEGATIVE_TEST_IDS;
            for (const s of testIds) { const t = gt(card.querySelector(s)); if (t) return t; }

            // Strategy 2: BEM classes (first tries .c-review__row--positive .c-review__body to skip the "Liked" prefix)
            const cls = type === 'positive' ? SELECTORS.POSITIVE_CLASSES : SELECTORS.NEGATIVE_CLASSES;
            for (const s of cls) { const t = gt(card.querySelector(s)); if (t) return t; }

            // Strategy 3: .c-review__row rows — target the c-review__body span INSIDE to skip the c-review__prefix span
            const rows = [...card.querySelectorAll('.c-review__row')];
            for (const row of rows) {
                const prefix = gt(row.querySelector('.c-review__prefix')).toLowerCase();
                const isPositiveRow = /liked|إيجابي|تُعجبني|positiv/i.test(prefix);
                const isNegativeRow = /disliked|سلبي|لم تُعجبني|negativ/i.test(prefix);

                if ((type === 'positive' && isPositiveRow) || (type === 'negative' && isNegativeRow)) {
                    // Get ONLY the body span, NOT the whole row
                    const bodyEl = row.querySelector('.c-review__body');
                    if (bodyEl) {
                        const t = gt(bodyEl);
                        if (t) return t;
                    }
                }
            }

            // Strategy 4: If no explicit positive/negative rows, use index-based (first row = positive, second = negative)
            if (rows.length >= 2) {
                const idx = type === 'positive' ? 0 : 1;
                const bodyEl = rows[idx].querySelector('.c-review__body');
                if (bodyEl) {
                    const t = gt(bodyEl);
                    if (t) return t;
                }
            } else if (rows.length === 1 && type === 'positive') {
                const bodyEl = rows[0].querySelector('.c-review__body');
                if (bodyEl) {
                    const t = gt(bodyEl);
                    if (t) return t;
                }
            }

            // Strategy 5: review-text-list
            const lis = [...card.querySelectorAll('ul.review-text-list li')];
            if (lis.length >= 2) {
                const li = lis[type === 'positive' ? 0 : 1];
                if (li) { const p = li.querySelector('p, span:not([class*="icon"]):not([class*="prefix"])'); return gt(p || li); }
            } else if (lis.length === 1 && type === 'positive') {
                const p = lis[0].querySelector('p, span:not([class*="icon"]):not([class*="prefix"])');
                return gt(p || lis[0]);
            }

            // Strategy 6: SVG icon-based
            const iconEl = card.querySelector(`.icon-review-${type === 'positive' ? 'pos' : 'neg'}`);
            if (iconEl) {
                const par = iconEl.closest('li') || iconEl.closest('p') || iconEl.parentElement;
                if (par) return gt(par.querySelector('p, span') || par);
            }

            // Strategy 7: SVG use href
            for (const li of card.querySelectorAll('li')) {
                const use = li.querySelector('svg use');
                if (!use) continue;
                const href = (use.getAttribute('href') || use.getAttribute('xlink:href') || '').toLowerCase();
                const match = type === 'positive' ? /pos|thumb.*up|like|good/.test(href) : /neg|thumb.*down|dislike|bad/.test(href);
                if (match) return gt(li.querySelector('p, span') || li);
            }
            return '';
        };

        let allNodes = [];
        for (const sel of SELECTORS.CARDS) {
            const found = [...document.querySelectorAll(sel)];
            if (found.length) { allNodes = found; break; }
        }
        if (!allNodes.length) return [];

        return allNodes.map(card => {
            const positive = getSection(card, 'positive');
            const negative = getSection(card, 'negative');
            const body = get(card, SELECTORS.BODY);

            // Room type — first try direct selectors, then fallback to keyword search
            const roomType = (() => {
                for (const s of SELECTORS.ROOM_TYPE) {
                    const el = card.querySelector(s);
                    if (el) { const t = gt(el); if (t) return t; }
                }
                // Fallback: inspect li items for room-like content
                const candidates = card.querySelectorAll('li, .review-info-item, .c-review-block__row, .bui-list__item, .c-review-block__room-info-row');
                for (const li of candidates) {
                    const text = gt(li);
                    const ltext = text.toLowerCase();
                    // Match "room", "stayed in", "night", or Arabic equivalents
                    if (ltext.includes('room') || ltext.includes('stayed in') || ltext.includes('غرفة') || ltext.includes('جناح') || ltext.includes('night') || ltext.includes('ليلة')) {
                        // If it contains "night", it might be "stayed 2 nights", but if it ALSO mentions a room name...
                        // Most specific room info is usually in a span or button or inner div
                        const specific = li.querySelector('[data-testid*="room"], button, .bui-list__body');
                        if (specific) return gt(specific);
                        
                        // Default to the whole text but strip "Stayed in " or "Room:" prefixes
                        return text.replace(/Stayed in\s*:/i, '').replace(/Room\s*:/i, '').trim();
                    }
                }
                return '';
            })();

            // Trip type — first try direct selectors, then fallback to keyword search
            const tripType = (() => {
                for (const s of SELECTORS.TRIP_TYPE) {
                    const el = card.querySelector(s);
                    if (el) { const t = gt(el); if (t && !/night|stay|room/i.test(t)) return t; }
                }
                const candidates = card.querySelectorAll('li, .review-info-item, .c-review-block__row, .bui-list__item, .c-review-block__v2-row');
                for (const li of candidates) {
                    const text = gt(li);
                    const ltext = text.toLowerCase();
                    if (TRIP_KEYWORDS.some(k => ltext.includes(k))) {
                        // Skip if it looks like room info instead
                        if (ltext.includes('room') || ltext.includes('غرفة')) continue;
                        
                        const specific = li.querySelector('[data-testid*="traveler"], [data-testid*="trip"], .bui-list__body');
                        if (specific) return gt(specific);
                        
                        return text;
                    }
                }
                return '';
            })();

            return {
                reviewerName: get(card, SELECTORS.REVIEWER_NAME),
                nationality: get(card, SELECTORS.NATIONALITY),
                date: get(card, SELECTORS.DATE),
                rating: get(card, SELECTORS.RATING),
                title: get(card, SELECTORS.TITLE),
                positive, negative, body, roomType, tripType
            };
        });
    }, { SELECTORS: selectors, TRIP_KEYWORDS: keywords });
}
