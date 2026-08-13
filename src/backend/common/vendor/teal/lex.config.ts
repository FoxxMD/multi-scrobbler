import { defineLexiconConfig } from '@atcute/lex-cli';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineLexiconConfig({
	generate: {
		files: ['lexicons/**/*.json'],
		outdir: 'lexicons/',
		imports: ['@atcute/bluesky'],
		modules: { importSuffix: '.ts' },
	},
	pull: {
		outdir: path.resolve(__dirname, 'lexicons/'),
		sources: [
			{
				type: 'git',
				remote: 'https://github.com/teal-fm/teal.git',
				ref: 'main',
				pattern: ['lexicons/fm.teal/feed/*.json','lexicons/fm.teal/actor/*.json'],
			},
		],
	},
});
