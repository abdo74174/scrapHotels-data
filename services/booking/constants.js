export const SELECTORS = {
    CARDS: ['[data-testid="review-card"]', '.c-review-block', '.review_list_new_item_block', 'li[data-review-id]', '.review_item'],

    // ── Positive / Negative ──
    // The REAL 2026 Booking HTML has: <span class="c-review__prefix">Liked</span> <span class="c-review__body">text</span>
    // We must target .c-review__body INSIDE the correct row, NOT the whole row (which concatenates "Liked · text")
    POSITIVE_TEST_IDS: ['[data-testid="review-positive-text"]', '[data-testid="review-positive"]', '[data-testid="review-body-positive"]'],
    NEGATIVE_TEST_IDS: ['[data-testid="review-negative-text"]', '[data-testid="review-negative"]', '[data-testid="review-body-negative"]'],
    POSITIVE_CLASSES: ['.c-review__row--positive .c-review__body', '.c-review__inner--positive', '.c-review__body--positive', '.review_pros', '.review_pos'],
    NEGATIVE_CLASSES: ['.c-review__row--negative .c-review__body', '.c-review__inner--negative', '.c-review__body--negative', '.review_cons', '.review_neg'],

    BODY: ['[itemprop="reviewBody"]', '.c-review__body', '.review_item_main_content', 'span[data-testid="review-body-text"]'],

    REVIEWER_NAME: ['.bui-avatar-block__title', '[data-testid="review-avatar"] + div span', '.reviewer_name'],
    NATIONALITY: ['.bui-avatar-block__subtitle', '[data-testid="review-avatar-flag"] ~ span', '.reviewer_country'],
    DATE: ['.c-review-block__date', '[data-testid="review-date"]', '.review_item_date'],
    RATING: ['.bui-review-score__badge', '[data-testid="review-score"]', '.review-score-badge'],
    TITLE: ['.c-review-block__title', '[data-testid="review-title"]', '.review_item_header_content'],

    // ── Room Type (CONFIRMED from real HTML) ──
    // Real: <a class="c-review-block__room-link"><div class="bui-list__body">Superior Room - King Bed</div></a>
    ROOM_TYPE: [
        '.c-review-block__room-link .bui-list__body',
        '.c-review-block__room-link',
        '.c-review-block__room-info-row',
        '[data-testid="review-room-name"]', '[data-testid="review-room-info"]', '[data-testid="room-info"]',
        '[data-testid="review-stay-info"] [data-testid="room-type"]', '[data-testid="stay-info-room"]',
        '.c-review-block__room-info', '.review_item_room_type', '.review-room-type',
    ],

    // ── Trip Type (CONFIRMED from real HTML) ──
    // Real: <ul class="review-panel-wide__traveller_type"><li class="bui-list__item"><div class="bui-list__body">Solo traveller</div></li></ul>
    TRIP_TYPE: [
        '.review-panel-wide__traveller_type .bui-list__body',
        '.review-panel-wide__traveller_type',
        '.c-review-block__v2-row',
        '[data-testid="review-traveler-type"]', '[data-testid="traveler-type"]',
        '[data-testid="review-stay-info"] [data-testid="traveler-type"]',
        '[data-testid="trip-type"]', '.c-review-block__traveler-type',
        '.review_item_info_tags li:first-child', '.review-traveler-type',
    ]
};

export const TRIP_KEYWORDS = ['couple', 'solo', 'family', 'group', 'business', 'friends', 'traveller', 'traveler', 'زوج', 'منفرد', 'عائلة', 'مجموعة', 'عمل', 'أصدقاء', 'مسافر'];
