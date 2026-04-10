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
    const m = clean.match(/([A-Za-z]+)\s+(\d{4})/);
    if (m) { const p = new Date(`${m[1]} 1, ${m[2]}`); if (!isNaN(p)) return p; }
    const m2 = clean.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (m2) { const p = new Date(`${m2[2]} ${m2[1]}, ${m2[3]}`); if (!isNaN(p)) return p; }
    return null;
}

export function inRange(dateStr, from, to) {
    const d = parseDate(dateStr);
    if (!d) return 'ok';
    if (from && d < new Date(from)) return 'before';
    if (to) { const t = new Date(to); t.setHours(23, 59, 59, 999); if (d > t) return 'after'; }
    return 'ok';
}
