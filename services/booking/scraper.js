import { newBrowser, dismissConsent } from '../common/browser.js';
import { cleanField } from '../common/utils.js';
import { SELECTORS, TRIP_KEYWORDS } from './constants.js';
import { parseBookingPage } from './utils/parser.js';

export async function scrapeBooking(socket, dateFrom, dateTo, hotelUrl, defaultUrls) {
    const reviews = [];
    const emit = (event, data) => {
        if (socket) {
            socket.emit(event, data);
        } else if (data.msg) {
            console.log(`[Booking] ${data.msg}`);
        }
    };

    const browser = await newBrowser();
    try {
        const ctx = await browser.newContext({
            locale: 'en-GB',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
        });
        const page = await ctx.newPage();

        let baseUrl = (hotelUrl || (defaultUrls && defaultUrls.booking) || '').trim();
        if (!baseUrl) throw new Error('No hotel URL provided for Booking.com');
        
        baseUrl = baseUrl.replace(/[?&]$/, '');
        const initialUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'tab=reviews';

        emit('site_status', { site: 'booking', msg: 'Finding Hotel ID...' });
        await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);
        await dismissConsent(page);

        const hotelData = await page.evaluate(() => {
            const idEl = document.querySelector('[data-hotel-id]');
            const hotel_id = idEl?.getAttribute('data-hotel-id')
                || (document.documentElement.innerHTML.match(/hotel_id["']?\s*[:=]\s*["']?(\d+)/i) || [])[1];

            const urlMatch = location.href.match(/\/hotel\/([a-z]{2})\/([^.]+)\./);
            const cc1 = urlMatch ? urlMatch[1] : null;
            const pagename = urlMatch ? urlMatch[2] : null;

            return { hotel_id, cc1, pagename };
        });

        if (hotelData.hotel_id) {
            emit('site_status', { site: 'booking', msg: `Found Hotel ID: ${hotelData.hotel_id}` });
        } else if (hotelData.pagename) {
            emit('site_status', { site: 'booking', msg: `Found Pagename: ${hotelData.pagename}` });
        }

        let pageNum = 1;
        let offset = 0;
        let stop = false;

        while (!stop && pageNum <= 500) {
            emit('site_status', { site: 'booking', msg: `Page ${pageNum} — ${reviews.length} total fetched...` });

            let listUrl;
            if (hotelData.hotel_id) {
                listUrl = `https://www.booking.com/reviewlist.html?hotel_id=${hotelData.hotel_id}&sort=f_recent_desc&offset=${offset}&rows=25&lang=en-gb`;
            } else if (hotelData.pagename) {
                listUrl = `https://www.booking.com/reviewlist.html?cc1=${hotelData.cc1}&pagename=${hotelData.pagename}&sort=f_recent_desc&offset=${offset}&rows=25&lang=en-gb`;
            }

            if (listUrl) {
                await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
            }

            try {
                // Wait for the specific review card test ID or other common review markers
                await page.waitForSelector(SELECTORS.CARDS.join(', '), { timeout: 15000 });
            } catch {
                break;
            }

            const rawCards = await parseBookingPage(page, SELECTORS, TRIP_KEYWORDS);

            if (rawCards.length === 0) break;

            for (const r of rawCards) {
                const positive = cleanField(r.positive);
                const negative = cleanField(r.negative);
                const body = cleanField(r.body);
                const reviewText = [positive, negative].filter(Boolean).join(' | ') || body;

                const reviewEntry = {
                    site: 'Booking.com',
                    reviewerName: r.reviewerName || '',
                    nationality: r.nationality || '',
                    date: r.date || '',
                    rating: r.rating || '',
                    title: r.title || '',
                    positive,
                    negative,
                    body,
                    reviewText,
                    roomType: r.roomType || '',
                    tripType: r.tripType || '',
                    scrapedAt: new Date().toISOString()
                };

                reviews.push(reviewEntry);
                if (socket) socket.emit('new_review', { site: 'booking', review: reviewEntry });
            }

            if (stop) break;
            offset += 25;
            pageNum++;
            if (rawCards.length < 5) break;
        }
    } finally {
        await browser.close();
    }
    return reviews;
}
