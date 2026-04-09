import { run as runBooking } from './scrapers/booking.js';
import { run as runAgoda } from './scrapers/agoda.js';
import { run as runExpedia } from './scrapers/expedia.js';
import { run as runHotels } from './scrapers/hotels.js';
import { run as runTripadvisor } from './scrapers/tripadvisor.js';
import { config } from './config.js';
import { execSync } from 'child_process';

async function main() {
    console.log('🚀 Starting Sequential Scrape of All Sites...\n');

    const scrapers = [
        { name: 'Booking.com', run: runBooking },
        { name: 'Agoda', run: runAgoda },
        { name: 'Expedia', run: runExpedia },
        { name: 'Hotels.com', run: runHotels },
        { name: 'TripAdvisor', run: runTripadvisor }
    ];

    for (const scraper of scrapers) {
        console.log(`\n--- Starting Scraper: ${scraper.name} ---`);
        try {
            await scraper.run();
            console.log(`✅ ${scraper.name} completed successfully.`);
        } catch (e) {
            console.error(`❌ ${scraper.name} failed:`, e.message);
        }
        
        console.log('Sleeping for 5 seconds between sites...');
        await new Promise(res => setTimeout(res, 5000));
    }

    console.log('\n🔄 All scrapers finished. Running merge...');
    try {
        execSync('node merge.js', { stdio: 'inherit' });
    } catch (e) {
        console.error('❌ Merge failed:', e.message);
    }

    console.log('\n✨ Orchestration complete.');
}

main();
