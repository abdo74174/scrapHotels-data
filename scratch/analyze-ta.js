import fs from 'fs';
import * as cheerio from 'cheerio';

const html = fs.readFileSync('scratch/ta-dom.html', 'utf8');
const $ = cheerio.load(html);

const reviewCards = [];
$('*').each((i, el) => {
    const text = $(el).text();
    // typical TA review contains a date of stay and maybe a bubble rating or "Date of stay"
    if (text.includes('Date of stay') && text.length < 5000 && text.length > 50) {
        reviewCards.push(el);
    }
});

// For the smallest valid cards, dump the HTML structure
const smallestCards = reviewCards.sort((a, b) => $(a).html().length - $(b).html().length).slice(0, 2);

console.log(`Found ${smallestCards.length} potential cards.`);
smallestCards.forEach((c, idx) => {
    fs.writeFileSync(`scratch/ta-card-${idx}.html`, $(c).parent().html() || $(c).html());
});
