// The generated spec has no operationIds, so starlight-openapi would slug the path (`/api/components/{id}` -> `apicomponentsid`).
// Give every operation the same slug docusaurus-plugin-openapi-docs derived from its summary, and redirect the old URLs.
// (Long term: emit these operationIds in src/backend/utils/OpenApiUtils.ts instead.)
import fs from 'node:fs';
import { baseHref } from './satteriBaseLinks.mjs';

const kebab = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function prepareSpec(src, dest, base) {
	const spec = JSON.parse(fs.readFileSync(src, 'utf8'));
	const slugs = [];
	for (const pathItem of Object.values(spec.paths ?? {})) {
		for (const op of Object.values(pathItem)) {
			if (typeof op !== 'object' || op === null || !('responses' in op)) continue;
			op.operationId ??= kebab(op.summary ?? '');
			slugs.push(op.operationId);
		}
	}
	fs.mkdirSync(new URL('.', dest), { recursive: true });
	// starlight-openapi renders descriptions itself, so root-relative Markdown links miss the base
	fs.writeFileSync(dest, JSON.stringify(spec).replace(/\]\((\/[^)\s"]*)\)/g, (_, href) => `](${baseHref(href, base)})`));
	return slugs;
}

/** old docusaurus-openapi-docs URL -> starlight-openapi URL */
export function apiRedirects(slugs, base) {
	const prefix = base.replace(/\/$/, '');
	return Object.fromEntries([
		['/api/multi-scrobbler-api', `${prefix}/api/`],
		...slugs.map((s) => [`/api/${s}`, `${prefix}/api/operations/${s}/`]),
	]);
}
