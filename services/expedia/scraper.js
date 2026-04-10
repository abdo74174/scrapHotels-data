import { scrapeExpediaLike } from '../common/expedia-base.js';
import { SELECTORS } from './constants.js';
import { parseExpediaPage } from './utils/parser.js';

export async function scrapeExpedia(socket, dateFrom, dateTo, hotelUrl, defaultUrls) {
    const url = hotelUrl || (defaultUrls && defaultUrls.expedia) || '';
    if (!url) throw new Error('No hotel URL provided for Expedia');
    
    return scrapeExpediaLike(
        'expedia', 
        'Expedia.com', 
        socket, 
        dateFrom, 
        dateTo, 
        url, 
        SELECTORS, 
        parseExpediaPage
    );
}
