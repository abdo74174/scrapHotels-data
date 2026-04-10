export async function parseExpediaPage(page, selectors) {
    return page.evaluate((S) => {
        const gt = el => el ? (el.innerText || el.textContent || '').trim() : '';
        const get = (card, sels) => { for (const s of sels) { const t = gt(card.querySelector(s)); if (t) return t; } return ''; };

        const cards = document.querySelectorAll(S.CARDS.join(', '));
        return Array.from(cards).map(card => ({
            reviewerName: get(card, S.REVIEWER_NAME),
            nationality: '',
            date: get(card, S.DATE),
            rating: get(card, S.RATING),
            title: get(card, S.TITLE),
            reviewText: get(card, S.BODY),
            positive: '',
            negative: '',
            roomType: '',
            tripType: ''
        }));
    }, selectors);
}
