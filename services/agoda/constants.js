export const SELECTORS = {
    CARDS: ['[data-info-type="review-card"]', '.Review-comment'],
    REVIEWER_NAME: ['[class*="reviewer-name"]', '.Review-comment-reviewer'],
    NATIONALITY: ['[class*="reviewer-country"]', '.Review-comment-reviewer__country'],
    DATE: ['[class*="review-date"]', '.Review-comment-date'],
    RATING: ['[class*="review-score"]', '.Review-comment-leftScore'],
    TITLE: ['[class*="review-title"]', '.Review-comment-bodyTitle'],
    REVIEW_TEXT: ['[class*="review-comment"]', '.Review-comment-bodyText'],
    NEXT_BUTTON: ['[data-element-name="review-next-page"]', 'button:has-text("Next")', '.Review-paginataion-next']
};
