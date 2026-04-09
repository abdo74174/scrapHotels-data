import fs from 'fs';
import { config } from './config.js';

console.log('🔄 Merging all review files...');

const allReviews = [];

for (const [site, filePath] of Object.entries(config.outputs)) {
    if (site === 'merged') continue;

    try {
        if (fs.existsSync(filePath)) {
            const reviews = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            allReviews.push(...reviews);
            console.log(`✅ Included ${reviews.length} reviews from ${site}`);
        }
    } catch (e) {
        console.error(`❌ Error reading ${site} reviews:`, e.message);
    }
}

fs.writeFileSync(config.outputs.merged, JSON.stringify(allReviews, null, 2));

console.log(`\n🎉 DONE! Total merged reviews: ${allReviews.length}`);
console.log(`📄 Saved to: ${config.outputs.merged}`);
