// These are kept for reference but the new scraper uses inline selectors with fallback chains
export const SELECTORS = {
    CARDS: [
        '[data-stid="reviews-and-ratings-item"]',
        '[data-stid="review-item"]',
        '[class*="ReviewItem"]',
        'article[class*="review"]',
    ],
    NEXT_BUTTON: [
        '[data-stid="pagination-next"]',
        'button[aria-label="Next page"]',
    ]
};