export async function parseTripAdvisorPage(page, selectors) {
    return page.evaluate((S) => {
        const gt = el => el ? (el.innerText || el.textContent || '').trim() : '';
        const get = (card, sels) => { for (const s of sels) { const t = gt(card.querySelector(s)); if (t) return t; } return ''; };

        const cards = document.querySelectorAll(S.CARDS.join(', '));
        return Array.from(cards).map(card => {
            let rating = '';
            const ratingEl = card.querySelector(S.RATING.join(', '));
            if (ratingEl) {
                const scoreMatch = ratingEl.className.match(/bubble_(\d+)/);
                if (scoreMatch) rating = (scoreMatch[1] / 10).toString();
            }

            return {
                reviewerName: get(card, S.REVIEWER_NAME),
                nationality: get(card, S.NATIONALITY),
                date: get(card, S.DATE),
                rating,
                title: get(card, S.TITLE),
                reviewText: get(card, S.BODY),
                positive: '',
                negative: '',
                roomType: '',
                tripType: get(card, S.TRIP_TYPE)
            };
        });
    }, selectors);
}
