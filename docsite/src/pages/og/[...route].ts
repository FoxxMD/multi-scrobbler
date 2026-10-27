import { getCollection } from 'astro:content';
import { OGImageRoute } from 'astro-og-canvas';

const entries = await getCollection('docs');
const pages = Object.fromEntries(entries.map(({ id, data }) => [id || 'index', data]));

export const { getStaticPaths, GET } = await OGImageRoute({
	pages,
	getImageOptions: (_path, page) => ({
		title: page.title,
		description: page.description ?? 'Listen everywhere, Scrobble anywhere',
		// icon + "Multi-Scrobbler" in one image, since the card layout only stacks logo/title/description. Regenerate with:
		// magick icon.png -resize 120x120 i.png; magick -background none -fill 'rgb(240,240,240)' -font fonts/AdwaitaSans-Regular-Static.ttf -pointsize 112 label:'Multi-Scrobbler' -trim +repage t.png
		// magick i.png \( -size 28x120 xc:none \) \( t.png -background none -gravity center -extent x120 \) -background none +append +repage -define png:color-type=6 og-logo.png
		logo: { path: './src/assets/og-logo.png' },
		// neutral dark fading into a darkened logo red (#c54a38)
		bgGradient: [[24, 24, 27], [28, 25, 26], [92, 36, 29]],
		border: { color: [197, 74, 56], width: 12, side: 'inline-start' },
		padding: 60,
		font: {
			title: { size: 64, families: ['Adwaita Sans'], color: [240, 240, 240] },
			description: { size: 32, families: ['Adwaita Sans'], color: [200, 200, 200] },
		},
		// local font (same one the Docusaurus social cards used) so offline/sandboxed builds work
		fonts: ['./src/assets/fonts/AdwaitaSans-Regular-Static.ttf'],
	}),
});
