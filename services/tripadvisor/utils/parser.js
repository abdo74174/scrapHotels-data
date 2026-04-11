export async function parseTripAdvisorPage(page, selectors) {
    return page.evaluate((S) => {
        const gt = el => el ? (el.innerText || el.textContent || '').trim() : '';
        const get = (card, sels) => { 
            for (const s of sels) { 
                const el = card.querySelector(s);
                if (el && gt(el)) return gt(el); 
            } 
            return ''; 
        };

        const cards = document.querySelectorAll(S.CARDS.join(', '));
        return Array.from(cards).map(card => {
            let rating = '';
            
            // Try SVG title first: "5.0 of 5 bubbles"
            const svgTitle = card.querySelector(S.RATING[0]);
            if (svgTitle && svgTitle.textContent) {
                const mo = svgTitle.textContent.match(/[\d.]+/);
                if (mo) rating = mo[0];
            } else {
                const ratingEl = card.querySelector(S.RATING[1]);
                if (ratingEl) {
                    const scoreMatch = ratingEl.className.match(/bubble_(\d+)/);
                    if (scoreMatch) rating = (scoreMatch[1] / 10).toString();
                }
            }

            // Extract date
            let date = get(card, S.DATE);
            if (!date) {
                // Sometime date is just raw text like "Date of stay: April 2026"
                const allDivs = card.querySelectorAll('div, span');
                for (const d of allDivs) {
                    if (d.textContent && (d.textContent.includes('Date of stay') || d.textContent.includes('stay:'))) {
                        date = d.textContent.split(':').pop().trim();
                        break;
                    }
                }
            }
            
            // Extract review content
            let body = get(card, S.BODY);
            if (!body) {
                // fallback to finding the biggest block of text inside the card that isn't title
                const divs = card.querySelectorAll('div');
                let maxT = '';
                for (const d of divs) {
                    if (!d.className.includes('title') && d.innerText.length > maxT.length) {
                        maxT = d.innerText;
                    }
                }
                body = maxT;
            }

            return {
                reviewerName: get(card, S.REVIEWER_NAME),
                nationality: get(card, S.NATIONALITY),
                date,
                rating,
                title: get(card, S.TITLE),
                reviewText: body,
                positive: '',
                negative: '',
                roomType: '',
                tripType: get(card, S.TRIP_TYPE)
            };
        });
    }, selectors);
}
