export const SELECTORS = {
    // Real selectors from debug on 2026-04-10
    CARDS: ['.Review-comment[data-review-id]', '.Review-comment'],
    REVIEWER_NAME: ['[data-info-type="reviewer-name"]'],
    NATIONALITY: ['[data-info-type="reviewer-name"] span:last-child'],
    STAY_DETAIL: ['[data-info-type="stay-detail"] span'],
    ROOM_TYPE: ['[data-info-type="room-type"] span'],
    GROUP_NAME: ['[data-info-type="group-name"] span'],
    DATE: ['[data-info-type="stay-detail"] span', '.Review-comment-date'],
    RATING: ['.Review-comment-leftScore'],
    TITLE: ['[data-testid="review-title"]', '.Review-comment-bodyTitle'],
    REVIEW_TEXT: ['[data-testid="review-comment"]', '[data-selenium="comment"]', '.Review-comment-bodyText'],
    REVIEWS_TAB: ['[data-element-name="customer-reviews-panel-navbar-menu"]', '#customer-reviews-panel-tab-5', 'button[aria-label="Reviews"]'],
    NEXT_BUTTON: ['[data-element-name="review-paginator-next"]', 'button[aria-label="Next reviews page"]'],
};

// Agoda internal API config
export const API_CONFIG = {
    ENDPOINT: 'https://www.agoda.com/api/cronos/property/review/HotelReviews',
    DEFAULT_PAGE_SIZE: 20,
    DEFAULT_SORTING: 7, // Most recent
    REVIEW_PROVIDER_IDS: [332, 3038, 27901, 28999, 29100, 27999, 27980, 27989, 29014],
};
