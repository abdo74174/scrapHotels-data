import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Use the stealth plugin
chromium.use(StealthPlugin());

export async function newBrowser() {
    return chromium.launch({
        headless: false,
        args: [
            '--no-sandbox', 
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
            '--disable-dev-shm-usage',
        ],
    });
}

export async function dismissConsent(page) {
    const btns = [
        '#onetrust-accept-btn-handler', 'button[id*="accept"]',
        'button:has-text("Accept all")', 'button:has-text("Accept All")',
        'button:has-text("Accept")', 'button:has-text("Agree")',
        'button:has-text("I agree")', 'button:has-text("OK")',
        'button:has-text("Got it")', 'button:has-text("Close")',
        '[data-gdpr-consent="accept"]',
        // Expedia/Hotels specific blockers
        'button[data-stid="apply-date-picker"]',
        'button:has-text("Done")',
        'button:has-text("Apply")',
        'button[aria-label="Close"]',
    ];
    for (const sel of btns) {
        try {
            const el = page.locator(sel).first();
            if (await el.isVisible({ timeout: 1500 })) {
                await el.click();
                await page.waitForTimeout(800);
            }
        } catch { }
    }
}
