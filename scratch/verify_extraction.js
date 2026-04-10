import { JSDOM } from 'jsdom';
import fs from 'fs';

const html = fs.readFileSync('c:/Users/pc/my-crawler/selector.htm', 'utf8');
const dom = new JSDOM(html);
const document = dom.window.document;

const gt = el => el ? (el.innerText || el.textContent || '').trim() : '';

const cards = document.querySelectorAll('[data-testid="review-card"], .c-review-block, .review_list_new_item_block, .review_item');
console.log(`Found ${cards.length} cards.`);

cards.forEach((card, i) => {
    const roomType = (() => {
        const roomSels = [
            '[data-testid="review-room-name"]',
            '[data-testid="review-room-info"]',
            '[data-testid="room-info"]',
            '[data-testid="review-stay-info"] [data-testid="room-type"]',
            '[data-testid="stay-info-room"]',
            '.c-review-block__room-link',
            '.c-review-block__room-info',
            '.review_item_room_type',
            '.review-room-type',
        ];
        for (const s of roomSels) {
            const el = card.querySelector(s);
            if (el) {
                const t = gt(el);
                if (t) return t;
            }
        }
        for (const li of card.querySelectorAll('li, .review-info-item, .c-review-block__row')) {
            const text = gt(li).toLowerCase();
            if (text.includes('room') || text.includes('stayed in') || (li.querySelector('svg') && text.length > 5 && !/night|solo|couple|family|group|business/i.test(text))) {
                const spans = [...li.querySelectorAll('span')];
                if (spans.length >= 2) return gt(spans[spans.length - 1]);
                return gt(li);
            }
        }
        return '';
    })();

    const tripType = (() => {
        const tripSels = [
            '[data-testid="review-traveler-type"]',
            '[data-testid="traveler-type"]',
            '[data-testid="review-stay-info"] [data-testid="traveler-type"]',
            '[data-testid="trip-type"]',
            '.c-review-block__traveler-type',
            '.c-review-block__info-list .bui-list__item:last-child',
            '.review_item_info_tags li:first-child',
            '.review-traveler-type',
        ];
        for (const s of tripSels) {
            const el = card.querySelector(s);
            if (el) {
                const t = gt(el);
                if (t && !/night|stay/i.test(t)) return t;
            }
        }
        const TRIP_KEYWORDS = ['couple', 'solo', 'family', 'group', 'business', 'friends', 'travel', 'منفرد', 'عائلة', 'زوج', 'عمل'];
        for (const li of card.querySelectorAll('li, .review-info-item, .c-review-block__row')) {
            const text = gt(li).toLowerCase();
            if (TRIP_KEYWORDS.some(k => text.includes(k))) {
                const spans = [...li.querySelectorAll('span')];
                if (spans.length >= 2) return gt(spans[spans.length - 1]);
                return gt(li);
            }
        }
        return '';
    })();

    console.log(`Card ${i + 1}:`);
    console.log(`  Room Type: ${roomType}`);
    console.log(`  Trip Type: ${tripType}`);
});
