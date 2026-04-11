import { newBrowser, dismissConsent } from '../services/common/browser.js';

async function test() {
    const browser = await newBrowser();
    try {
        const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 1000 } });
        const page = await ctx.newPage();

        let apiUrls = [];
        page.on('response', async (res) => {
            const u = res.url();
            if (u.includes('.js') || u.includes('.css') || u.includes('.woff') || u.includes('.png') || u.includes('.jpg')) return;
            if (u.includes('trts') || u.includes('beacon') || u.includes('analytics')) return;
            apiUrls.push(u);
            if(u.includes('graphql') && res.status() === 200) {
                try {
                    const json = await res.json();
                    let s = JSON.stringify(json);
                    if (s.includes('review') || s.includes('reviewer')) {
                        console.log(`[GRAPHQL] length ${s.length} snippet ${s.slice(0, 100)}...`);
                    }
                }catch(e){}
            }
        });

        const url = "https://www.hotels.com/ho234548/four-seasons-hotel-cairo-at-nile-plaza-cairo-egypt/?locale=en_GB&siteid=310000033";
        await page.goto(url, { waitUntil: 'load', timeout: 90000 });
        await page.waitForTimeout(5000);
        await dismissConsent(page);

        // Click review button
        apiUrls = [];
        const btn = page.locator('button:has-text("reviews")').first();
        if (await btn.count() > 0) {
            console.log("Clicking generic reviews button...");
            await btn.click({force: true});
            await page.waitForTimeout(6000);
        }

        console.log("URLs after click:");
        console.log(apiUrls.filter(u => u.includes('graphql') || u.includes('api')));

        const texts = await page.$$eval('div', arr => {
             const list = [];
             for (const el of arr) {
                 if (el.innerText && el.innerText.includes('Stayed ')) {
                     list.push(el.innerText);
                 }
             }
             return list;
        });
        const shortest = texts.sort((a,b) => a.length - b.length)[0] || '';
        console.log(`Shortest Stayed text:\n`, shortest.substring(0, 500));
    } finally {
        await browser.close();
    }
}
test();
