import { scrapeExpediaLike } from '../common/expedia-base.js';

export async function scrapeExpedia(socket, dateFrom, dateTo, hotelUrl) {
    if (!hotelUrl) throw new Error('No hotel URL provided for Expedia');
    
    return scrapeExpediaLike(
        'expedia', 
        'Expedia.com', 
        socket, 
        dateFrom, 
        dateTo, 
        hotelUrl
    );
}