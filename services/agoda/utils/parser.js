export async function parseAgodaPage(page, selectors) {
    return page.evaluate((S) => {
        let cards = [...document.querySelectorAll(S.CARDS.join(', '))];
        return cards.map(card => {
            const get = (sels) => {
                for (const s of sels) {
                    const el = card.querySelector(s);
                    if (el && el.innerText.trim()) return el.innerText.trim();
                }
                return '';
            };
            return {
                reviewerName: get(S.REVIEWER_NAME),
                nationality: get(S.NATIONALITY),
                date: get(S.DATE),
                rating: get(S.RATING),
                title: get(S.TITLE),
                reviewText: get(S.REVIEW_TEXT),
            };
        });
    }, selectors);
}
