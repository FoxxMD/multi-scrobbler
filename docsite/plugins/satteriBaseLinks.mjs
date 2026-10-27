/**
 * Root-relative links (`/configuration/sources?x=y#z`) need:
 * - Astro's `base` prefixed (Docusaurus did this automatically, Astro does not)
 * - a trailing slash, otherwise `astro dev`/`astro preview` 404 them
 */
export function baseHref(href, base) {
	const prefix = base.replace(/\/$/, '');
	if (!href.startsWith('/') || href.startsWith('//')) return href;
	const [, path, rest = ''] = /^([^?#]*)(.*)$/.exec(href);
	let p = path;
	// pages (not files like /openapi.json) get a trailing slash
	if (!p.endsWith('/') && !/\.[a-z0-9]+$/i.test(p)) p += '/';
	if (prefix !== '' && p !== `${prefix}/` && !p.startsWith(`${prefix}/`)) p = `${prefix}${p}`;
	return p + rest;
}

/** Sätteri hast plugin applying `baseHref` to Markdown links */
export function satteriBaseLinks(base) {
	return {
		name: 'satteri-base-links',
		element: {
			filter: ['a'],
			visit(node, ctx) {
				const href = node.properties?.href;
				if (typeof href !== 'string') return;
				const fixed = baseHref(href, base);
				if (fixed !== href) ctx.setProperty(node, 'href', fixed);
			},
		},
	};
}

/** Expressive Code plugin applying `baseHref` to links starlight-codeblocks renders in annotations, footnotes and callouts */
export function ecBaseLinks(base) {
	const visit = (node) => {
		if (node.type === 'element' && node.tagName === 'a' && typeof node.properties?.href === 'string')
			node.properties.href = baseHref(node.properties.href, base);
		node.children?.forEach(visit);
	};
	return {
		name: 'ec-base-links',
		hooks: { postprocessRenderedBlockGroup: ({ renderData }) => visit(renderData.groupAst) },
	};
}
