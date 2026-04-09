import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { config, userAgents } from './config.js';

/**
 * 🏨 Booking.com Selector Debugger
 * This tool analyzes the DOM structure of Booking.com review cards.
 * It helps identify why scrapers might be failing by extracting all node metadata.
 */

async function debugBookingSelectors() {
    const targetUrl = process.argv[2] || config.urls.booking || 'https://www.booking.com/reviewlist.html?pagename=four-seasons-cairo-at-nile-plaza&cc1=eg&rows=10&offset=0&sort=f_recent_desc&lang=en-gb';
    const outputDir = './debug_output';

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    console.log('🚀 Starting Selector Debugger...');
    console.log(`🔗 Target: ${targetUrl}`);

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        userAgent: userAgents[0],
        viewport: { width: 1280, height: 800 },
        locale: 'en-GB'
    });

    try {
        const page = await context.newPage();

        // 1. Page Loading
        console.log('⏳ Loading page...');
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Handle potential "Accept" dialogs
        try {
            const acceptBtn = page.locator('button:has-text("Accept"), button:has-text("Allow all"), #onetrust-accept-btn-handler');
            if (await acceptBtn.isVisible({ timeout: 5000 })) {
                await acceptBtn.click();
                console.log('✅ Dismissed cookie consent.');
            }
        } catch (e) { }

        // 2. Selector Detection
        console.log('🔍 Searching for review cards...');
        const CARD_SELS = [
            '[data-testid="review-card"]',
            '.c-review-block',
            '.review_item',
            '.review_list_new_item_block'
        ];

        let matchedSelector = null;
        for (const sel of CARD_SELS) {
            const count = await page.locator(sel).count();
            if (count > 0) {
                matchedSelector = sel;
                console.log(`✨ Matched Selector: "${sel}" (${count} cards found)`);
                break;
            }
        }

        if (!matchedSelector) {
            console.error('❌ Error: No review cards found with any known selectors.');
            const bodyHtml = await page.content();
            fs.writeFileSync(path.join(outputDir, 'failed_page_load.html'), bodyHtml);
            console.log(`📄 Saved current page HTML to ${path.join(outputDir, 'failed_page_load.html')} for inspection.`);
            return;
        }

        // 3. Node Extraction
        console.log('🧪 Extracting metadata from the first card...');
        const result = await page.evaluate((selector) => {
            const card = document.querySelector(selector);
            if (!card) return null;

            const cardHtml = card.outerHTML;
            const nodes = [];

            // Recursive function to walk the tree
            function walk(node) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    nodes.push({
                        tagName: node.tagName.toLowerCase(),
                        className: node.className || '',
                        dataTestId: node.getAttribute('data-testid') || '',
                        ariaLabel: node.getAttribute('aria-label') || '',
                        dataEtClick: node.getAttribute('data-et-click') || '',
                        textContent: (node.innerText || node.textContent || '').trim().slice(0, 100) // snippet
                    });
                }
                for (let child of node.childNodes) {
                    walk(child);
                }
            }

            walk(card);
            return {
                cardHtml,
                pageHtml: document.documentElement.outerHTML,
                nodes
            };
        }, matchedSelector);

        if (!result) {
            console.error('❌ Failed to extract data from the matched element.');
            return;
        }

        // 4. File Output
        fs.writeFileSync(path.join(outputDir, 'review-card.html'), result.cardHtml);
        fs.writeFileSync(path.join(outputDir, 'page.html'), result.pageHtml);
        fs.writeFileSync(path.join(outputDir, 'nodes.json'), JSON.stringify(result.nodes, null, 2));

        // 5. Final Report
        console.log('\n' + '='.repeat(60));
        console.log('📊 DEBUG REPORT');
        console.log('='.repeat(60));
        console.log(`Selector Used   : ${matchedSelector}`);
        console.log(`Nodes Extracted : ${result.nodes.length}`);
        console.log(`Card Preview    : ${result.cardHtml.slice(0, 200)}...`);
        console.log('='.repeat(60));
        console.log('\nTop 10 Nodes found on card:');
        console.table(result.nodes.slice(0, 10));

        console.log(`\n📂 Files saved to ${path.resolve(outputDir)}:`);
        console.log(' - review-card.html : The raw HTML of the first card');
        console.log(' - page.html        : The full HTML of the page (post-load)');
        console.log(' - nodes.json       : Detailed metadata for every tag in the card');
        console.log('='.repeat(60));

    } catch (err) {
        console.error('\n💥 FATAL ERROR during debug session:');
        console.error(err);
    } finally {
        console.log('\n👋 Closing browser. Keep debugging!');
        await browser.close();
    }
}

// Run the debugger
debugBookingSelectors();
