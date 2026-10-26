/**
 * Sätteri hast plugin for root-relative Markdown links (`/configuration/sources?x=y#z`):
 * - prefix Astro's `base` (Docusaurus did this automatically, Astro does not)
 * - add the trailing slash `trailingSlash: 'always'` expects, otherwise `astro dev`/`astro preview` 404 them
 */
export function satteriBaseLinks(base) {
	const prefix = base.replace(/\/$/, '');
	return {
		name: 'satteri-base-links',
		element: {
			filter: ['a'],
			visit(node, ctx) {
				const href = node.properties?.href;
				if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return;
				const [, path, rest = ''] = /^([^?#]*)(.*)$/.exec(href);
				let p = path;
				// pages (not files like /openapi.json) get a trailing slash
				if (!p.endsWith('/') && !/\.[a-z0-9]+$/i.test(p)) p += '/';
				if (prefix !== '' && p !== `${prefix}/` && !p.startsWith(`${prefix}/`)) p = `${prefix}${p}`;
				if (p + rest !== href) ctx.setProperty(node, 'href', p + rest);
			},
		},
	};
}
