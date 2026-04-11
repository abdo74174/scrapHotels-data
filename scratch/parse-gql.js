import fs from 'fs';

try {
    const raw = fs.readFileSync('scratch/graphql-all.json', 'utf8');
    const parts = raw.split('\n\n').filter(Boolean);
    
    parts.forEach((p, i) => {
        try {
            const j = JSON.parse(p);
            // Search deep for any arrays
            const findArrays = (obj, path = '') => {
                if (Array.isArray(obj) && obj.length > 0) {
                    if (JSON.stringify(obj).includes('submissionDate') || JSON.stringify(obj).includes('rating') || JSON.stringify(obj).toLowerCase().includes('good')) {
                       console.log(`[PART ${i}] Array at ${path} with length ${obj.length}`);
                    }
                } else if (obj !== null && typeof obj === 'object') {
                    for (const k in obj) {
                        findArrays(obj[k], path ? `${path}.${k}` : k);
                    }
                }
            };
            findArrays(j);
        } catch(e) {
            console.error(`Part ${i} json parse error`);
        }
    });
} catch(e) { console.error(e); }
