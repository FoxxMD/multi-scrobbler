import { getCollection } from 'astro:content';
import { OGImageRoute } from 'astro-og-canvas';

const entries = await getCollection('docs');
const pages = Object.fromEntries(entries.map(({ id, data }) => [id || 'index', data]));

export const { getStaticPaths, GET } = await OGImageRoute({
	pages,
	getImageOptions: (_path, page) => ({
		title: page.title,
		description: page.description ?? 'Scrobble all the things',
		logo: { path: './src/assets/icon.png', size: [100] },
		bgGradient: [[24, 24, 27], [17, 94, 89]],
		border: { color: [37, 194, 160], width: 12, side: 'inline-start' },
		padding: 60,
		font: {
			title: { size: 64, families: ['Adwaita Sans'], color: [240, 240, 240] },
			description: { size: 32, families: ['Adwaita Sans'], color: [200, 200, 200] },
		},
		// local font (same one the Docusaurus social cards used) so offline/sandboxed builds work
		fonts: ['./src/assets/fonts/AdwaitaSans-Regular-Static.ttf'],
	}),
});
