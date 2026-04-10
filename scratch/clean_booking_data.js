import fs from 'fs';

const LABEL_PREFIXES = [
    /^(?:liked|disliked|positives?|negatives?|pros?|cons?|what we liked|what could be improved|تُعجبني|لم تُعجبني)\s*[\xA0\s]*[·•\-:|\u2022\u2023\u2043\u25E6]+\s*/i,
    /^(?:liked|disliked|positives?|negatives?|pros?|cons?):\s*/i,
    /^(?:liked|disliked)\s*[\xA0\s]*/i,
];

const clean = (str) => {
    if (!str) return '';
    let t = str.trim();
    for (const rx of LABEL_PREFIXES) {
        t = t.replace(rx, '');
    }
    return t.trim();
};

const filePath = 'data/reviews_booking.json';

try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`Cleaning ${data.length} reviews...`);

    const cleaned = data.map(r => {
        const positive = clean(r.positive);
        const negative = clean(r.negative);

        // Update reviewText if it was based on positive/negative
        let reviewText = r.reviewText;
        if (r.positive || r.negative) {
            reviewText = [positive, negative].filter(Boolean).join(' | ');
        }

        return {
            ...r,
            positive,
            negative,
            reviewText
        };
    });

    fs.writeFileSync(filePath, JSON.stringify(cleaned, null, 2));
    console.log('Done! Existing reviews cleaned of "Liked/Disliked" prefixes.');
} catch (err) {
    console.error('Error cleaning file:', err.message);
}
