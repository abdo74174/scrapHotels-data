const EMPTY_PHRASES = [
    'there are no comments available for this review',
    'no comments', 'no comment', 'n/a', 'none',
];

export const cleanField = (str) => {
    if (!str) return '';
    let t = str.trim();
    // Strip any Liked · / Disliked · style prefix if it already exists
    // Booking.com uses non-breaking spaces (\u00A0) and middle dots (\u00B7)
    const prefixes = [
        // Most aggressive: "Liked" or "Disliked" followed by any mix of spaces/nbsp/dots/separators
        /^(?:liked|disliked|إيجابي|سلبي)[\s\u00A0]*[·•\u00B7\u2022\u2023\u2043\u25E6\-:|]*[\s\u00A0]*/i,
        // General labels with separators
        /^(?:positives?|negatives?|pros?|cons?|what we liked|what could be improved|تُعجبني|لم تُعجبني)[\s\u00A0]*[·•\u00B7\u2022\u2023\u2043\u25E6\-:|]*[\s\u00A0]*/i,
        // Labels followed by colon
        /^(?:liked|disliked|positives?|negatives?|pros?|cons?):\s*/i,
    ];
    for (const rx of prefixes) {
        t = t.replace(rx, '');
    }
    t = t.trim();
    return EMPTY_PHRASES.some(p => t.toLowerCase().includes(p)) ? '' : t;
};

export function normalizeUrl(url) {
    if (!url) return '';
    let cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
        cleanUrl = 'https://' + cleanUrl;
    }
    return cleanUrl;
}

export function parseDate(str) {
    if (!str) return null;
    const clean = str.replace(/reviewed|written|posted|date of stay|stayed in|:|\n/gi, ' ').trim();
    const d = new Date(clean);
    if (!isNaN(d)) return d;

    // Handle numeric timestamps
    if (!isNaN(clean) && clean.length >= 10 && /^\d+$/.test(clean)) {
        const num = Number(clean);
        const p = new Date(num > 9999999999 ? num : num * 1000); 
        if (!isNaN(p)) return p;
    }
    return null;
}

export function inRange(dateStr, from, to) {
    const d = parseDate(dateStr);
    if (!d) return 'in';
    if (from && d < new Date(from)) return 'before';
    if (to) { const t = new Date(to); t.setHours(23, 59, 59, 999); if (d > t) return 'after'; }
    return 'in';
}

