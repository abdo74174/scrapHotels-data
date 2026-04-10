import { scrapeExpediaLike } from '../common/expedia-base.js';
import { SELECTORS } from './constants.js';
import { parseHotelsPage } from './utils/parser.js';

export async function scrapeHotels(socket, dateFrom, dateTo, hotelUrl, defaultUrls) {
    const url = hotelUrl || (defaultUrls && defaultUrls.hotels) || '';
    if (!url) throw new Error('No hotel URL provided for Hotels.com');
    
    return scrapeExpediaLike(
        'hotels', 
        'Hotels.com', 
        socket, 
        dateFrom, 
        dateTo, 
        url, 
        SELECTORS, 
        parseHotelsPage
    );
}
