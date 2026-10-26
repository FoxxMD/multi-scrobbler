// Starlight can't autogenerate from the content root inside an explicit `sidebar` array
// (`autogenerate: { directory: '' }` matches nothing), so expand the root level here:
// top-level pages become links, top-level directories become groups that autogenerate their contents.
// Ordering uses `sidebar.order` frontmatter / `_meta.yml` `order`, like Docusaurus' sidebar_position / _category_.json.
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import yaml from 'js-yaml';

export function rootSidebar(docsDir) {
	const items = [];
	for (const entry of fs.readdirSync(docsDir, { withFileTypes: true })) {
		if (entry.name.startsWith('_')) continue;
		const full = path.join(docsDir, entry.name);
		if (entry.isDirectory()) {
			const metaFile = path.join(full, '_meta.yml');
			const meta = fs.existsSync(metaFile) ? yaml.load(fs.readFileSync(metaFile, 'utf8')) : {};
			if (meta.hidden) continue;
			items.push({
				order: meta.order ?? Number.MAX_VALUE,
				name: entry.name,
				item: { label: meta.label ?? entry.name, collapsed: meta.collapsed ?? false, items: [{ autogenerate: { directory: entry.name } }] },
			});
		} else if (/\.mdx?$/.test(entry.name)) {
			const { data } = matter(fs.readFileSync(full, 'utf8'));
			if (data.sidebar?.hidden) continue;
			const slug = data.slug ?? entry.name.replace(/\.mdx?$/, '').toLowerCase();
			items.push({ order: data.sidebar?.order ?? Number.MAX_VALUE, name: entry.name, item: slug === 'index' || slug === '' ? { slug: '' , label: data.sidebar?.label ?? data.title } : slug });
		}
	}
	return items.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)).map((x) => x.item);
}
