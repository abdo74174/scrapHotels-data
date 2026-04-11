import { newBrowser, dismissConsent } from '../services/common/browser.js';
import fs from 'fs';

async function testTA() {
    const browser = await newBrowser();
    try {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        
        // Log all responses
        page.on('response', async res => {
            if (res.url().includes('graphql') && res.status() === 200) {
                try {
                    const j = await res.json();
                    if (JSON.stringify(j).includes('review')) {
                        fs.appendFileSync('scratch/ta-graphql.json', JSON.stringify(j, null, 2) + '\n\n');
                    }
                }catch(e){}
            }
        });

        const url = 'https://www.tripadvisor.com/Hotel_Review-g294201-d308077-Reviews-Four_Seasons_Hotel_Cairo_at_Nile_Plaza-Cairo_Cairo_Governorate.html';
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);
        await dismissConsent(page);

        // Dump DOM
        const html = await page.content();
        fs.writeFileSync('scratch/ta-dom.html', html);
        console.log(`Saved TA dom of length ${html.length}`);
    } finally {
        await browser.close();
    }
}
testTA();
