import { chromium } from 'playwright';

export async function newBrowser() {
    return chromium.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
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
    ];
    for (const sel of btns) {
        try {
            const el = page.locator(sel).first();
            if (await el.isVisible({ timeout: 1500 })) {
                await el.click();
                await page.waitForTimeout(800);
                return;
            }
        } catch { }
    }
}
