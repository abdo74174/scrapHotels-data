export const SELECTORS = {
    CARDS: ['[data-stid="reviews-list"] li', 'div[class*="review-"]'],
    REVIEWER_NAME: ['[itemprop="author"]', '[class*="userName"]'],
    DATE: ['[itemprop="datePublished"]', 'time'],
    RATING: ['[class*="ratingNumber"]'],
    TITLE: ['h3', 'h4', '[class*="title"]'],
    BODY: ['[itemprop="description"]', 'p'],
    NEXT_BUTTON: ['button:has-text("Next")', '[data-stid="pagination-next"]']
};
