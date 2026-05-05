
import fs from 'node:fs/promises';
import path from 'node:path';

var args = process.argv.slice(2);

const linkRegex = new RegExp(/<link data-rh="true" rel="\w+"\shref="(https:\/\/foxxmd\.github\.io\/docs)/g,);
const replacement = process.env.CANONICAL_HREF ?? 'https://docs.multi-scrobbler.app';

/**
 * Replace canonical and alternative <link> nodes with the "real" domain of the site
 * so that SEO (google) chooses the correct domain when showing search results
 * 
 */

(async function () {

    if(replacement === undefined || replacement === '') {
        console.warn('No replacement value found in process.env.CANONICAL_HREF');
        return;
    }

    const buildDir = path.resolve(args[0]);
    console.log(`Reading dir recursively ${buildDir}`);
    const files = (await fs.readdir(buildDir, { recursive: true })).filter(x => x.includes('.html'));
    console.log(`Found ${files.length} files with .html extensions`);
    let modifications = 0;

    await Promise.all(files.map(async (x) => {
            const filePath = path.resolve(path.join(buildDir, x));
            //console.log(`Replacing at ${filePath}`);
            await fs.writeFile(filePath, (await fs.readFile(filePath)).toString().replace(linkRegex, (match, capture, offset, string, groups) => {
                // this may not be fully accurate since we're mutating concurrently/async
                // but its a good enough signal for logging to tell if replacements happened
                modifications++;
                return match.replace(capture, replacement);
            }));
    }));

    console.log(`Done with ${modifications} replacements`);

}());