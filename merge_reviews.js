import fs from 'node:fs';
import path from 'node:path';

const datasetsDir = './storage/datasets/default';
const outputFile = './all_reviews.json';

try {
    if (!fs.existsSync(datasetsDir)) {
        console.error(`Error: Directory ${datasetsDir} not found.`);
        process.exit(1);
    }

    const files = fs.readdirSync(datasetsDir).filter(file => file.endsWith('.json'));
    console.log(`Found ${files.length} review files. Merging...`);

    const allReviews = files.map(file => {
        const filePath = path.join(datasetsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    });

    fs.writeFileSync(outputFile, JSON.stringify(allReviews, null, 2), 'utf8');
    console.log(`Successfully merged ${allReviews.length} reviews into ${outputFile}`);
} catch (error) {
    console.error('An error occurred during merging:', error.message);
    process.exit(1);
}
