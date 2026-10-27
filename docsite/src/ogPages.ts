// Social preview data per route id, shared by the image endpoint (src/pages/og/[...route].ts)
// and the route middleware that writes the og:/twitter: meta tags (src/routeData.ts).
import { getCollection } from 'astro:content';
import { changelogsBase, changelogsEnabled } from '../plugins/changelogs.mjs';

export interface OgPage {
	title: string;
	description?: string | undefined;
	/** route id of the image to use; pages that share another page's image point at that id */
	image: string;
}

/** only the newest versions get their own image, older ones use the changelog's */
const CHANGELOG_IMAGES = 5;

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' });

const docs = await getCollection('docs');
// the content store keeps entries from earlier builds even when the changelog loader is disabled
const versions = changelogsEnabled ? (await getCollection('changelogs')).sort((a, b) => a.data.index - b.data.index) : [];

export const ogPages: Record<string, OgPage> = Object.fromEntries([
	...docs.map(({ id, data }) => [id || 'index', { title: data.title, description: data.description, image: id || 'index' }]),
	...(versions.length === 0
		? []
		: [[changelogsBase, { title: 'Changelog', description: 'Multi-Scrobbler release notes', image: changelogsBase }]]),
	...versions.flatMap(({ id, data }) => {
		const released = data.date ? `, released ${dateFormat.format(data.date)}` : '';
		const version = data.title.replace(/^v/, '');
		return [
			[id, { title: `Version ${version}`, description: `Multi-Scrobbler ${version} release notes${released}`, image: data.index < CHANGELOG_IMAGES ? id : changelogsBase }],
			[`${id}...latest`, { title: `Changes since ${version}`, description: `Multi-Scrobbler release notes from ${version} to the latest version`, image: changelogsBase }],
		];
	}),
]);

/** pages generated from their own entry; everything else reuses one of these */
export const ogImagePages = Object.fromEntries(Object.entries(ogPages).filter(([id, page]) => page.image === id));

export function getOgPage(routeId: string): OgPage {
	// the changelog's paginated version lists (updating/changelog/2, …) share its preview;
	// pages outside the docs collection (playground, API) use the overview's image
	if (ogPages[routeId]) return ogPages[routeId];
	if (routeId.startsWith(`${changelogsBase}/`) && ogPages[changelogsBase]) return ogPages[changelogsBase];
	return { title: '', image: 'index' };
}
