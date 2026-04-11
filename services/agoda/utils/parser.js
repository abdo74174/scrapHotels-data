export async function parseAgodaPage(page, selectors) {
    return page.evaluate((S) => {
        // Use the real card selector
        let cards = [...document.querySelectorAll(S.CARDS.join(', '))];
        
        // Deduplicate — sometimes .Review-comment matches both selectors
        const seen = new Set();
        cards = cards.filter(card => {
            const id = card.getAttribute('data-review-id') || card.id || card.textContent.slice(0, 100);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });

        return cards.map(card => {
            const get = (sels) => {
                for (const s of sels) {
                    const el = card.querySelector(s);
                    if (el && el.innerText.trim()) return el.innerText.trim();
                }
                return '';
            };

            // Parse reviewer info: "Abdul from Qatar"
            const reviewerRaw = get(S.REVIEWER_NAME);
            let reviewerName = reviewerRaw;
            let nationality = '';
            const fromMatch = reviewerRaw.match(/^(.+?)\s+from\s+(.+)$/i);
            if (fromMatch) {
                reviewerName = fromMatch[1].trim();
                nationality = fromMatch[2].trim();
            }

            // Date from stay detail: "Stayed 1 night in July 2022"
            const stayDetail = get(S.DATE);
            let date = stayDetail;
            const stayMatch = stayDetail.match(/(?:stayed\s+\d+\s+nights?\s+in\s+)?(.+)/i);
            if (stayMatch) date = stayMatch[1];

            return {
                reviewerName,
                nationality,
                date,
                rating: get(S.RATING),
                title: get(S.TITLE),
                reviewText: get(S.REVIEW_TEXT),
                roomType: get(S.ROOM_TYPE || []),
                tripType: get(S.GROUP_NAME || []),
            };
        });
    }, selectors);
}
