export const SELECTORS = {
    CARDS: ['[data-test-target="HR_CC_CARD"]', 'div.Yq', 'div[data-automation="reviewCard"]'],
    REVIEWER_NAME: ['a[href^="/Profile/"]', 'a.ui_header_link'],
    NATIONALITY: ['div[class*="userLocation"]'],
    DATE: ['.ratingDate', 'div:contains("Date of stay") + span', 'span:contains("Date of stay") + span', 'div:contains("stay:") > span:nth-child(2)'],
    RATING: ['svg[aria-labelledby*="bubble"] title', 'span[class*="ui_bubble_rating"]'],
    TITLE: ['[data-test-target="review-title"]', '.noQuotes'],
    BODY: ['div[style*="line-break: normal"]', 'span.JguWG', 'q[class*="IRsGHoPm"]', 'div[data-test-target="review-body"]'],
    TRIP_TYPE: ['span[class*="tripType"]'],
    NEXT_BUTTON: ['a[class*="next"]', 'button[class*="next"]', 'a.ui_button.nav.next.primary']
};
