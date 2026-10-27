// starlight-openapi renders the spec's descriptions itself, so root-relative Markdown links in them miss the base.
// Write a copy with those links fixed and return every operationId (set in src/backend/utils/OpenApiUtils.ts),
// which starlight-openapi uses as the page slug (/api/operations/<operationId>/).
import fs from 'node:fs';
import { baseHref } from './satteriBaseLinks.mjs';

export function prepareSpec(src, dest, base) {
	const json = fs.readFileSync(src, 'utf8');
	fs.mkdirSync(new URL('.', dest), { recursive: true });
	fs.writeFileSync(dest, json.replace(/\]\((\/[^)\s"]*)\)/g, (_, href) => `](${baseHref(href, base)})`));
	return Object.values(JSON.parse(json).paths ?? {}).flatMap((pathItem) => Object.values(pathItem).map((op) => op.operationId));
}

/** old docusaurus-openapi-docs URL -> starlight-openapi URL */
export function apiRedirects(slugs, base) {
	const prefix = base.replace(/\/$/, '');
	return Object.fromEntries([
		['/api/multi-scrobbler-api', `${prefix}/api/`],
		...slugs.map((s) => [`/api/${s}`, `${prefix}/api/operations/${s}/`]),
	]);
}
