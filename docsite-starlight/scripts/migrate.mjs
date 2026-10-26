// Codemod: copy ../docsite/docs into src/content/docs, converting Docusaurus-specific syntax for Starlight.
// Re-runnable: the destination is wiped first. `docs/api` is skipped (starlight-openapi generates it from the spec).
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import * as yaml from 'js-yaml';

const root = path.resolve(import.meta.dirname, '..');
const docusaurusRoot = path.resolve(root, '../docsite');
const SRC = path.join(docusaurusRoot, 'docs');
const DEST = path.join(root, 'src/content/docs');
const PUBLIC = path.join(root, 'public');

const stats = {};

// docs used as a category's landing page (`_category_.json` link.type=doc): id -> category file
const categoryLinkDocs = new Map();
for (const f of fs.readdirSync(SRC, { recursive: true })) {
	if (path.basename(f) !== '_category_.json' || f.startsWith('api')) continue;
	const cat = JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
	if (cat.link?.type === 'doc') categoryLinkDocs.set(cat.link.id, f);
}
const count = (k, n = 1) => (stats[k] = (stats[k] ?? 0) + n);

const isPartialPath = (rel) => rel.split(path.sep).some((s) => s.startsWith('_'));
const stemOf = (f) => path.basename(f).replace(/\.mdx?$/, '');

/** URL path (no base, with trailing slash) Docusaurus generates for a docs-relative file path */
function urlForDoc(rel) {
	const dir = path.dirname(rel) === '.' ? '' : path.dirname(rel).split(path.sep).join('/');
	const stem = stemOf(rel);
	if (stem === 'index' || (dir !== '' && stem === path.basename(dir))) return `/${dir}${dir ? '/' : ''}`;
	return `/${dir ? `${dir}/` : ''}${stem}/`;
}

/** Slug override needed so Starlight produces the same URL Docusaurus did, or undefined if the default matches */
function slugFor(rel) {
	const url = urlForDoc(rel);
	const slug = url.replace(/^\/|\/$/g, '');
	const starlightDefault = rel.replace(/\.mdx?$/, '').split(path.sep).join('/').toLowerCase().replace(/(^|\/)index$/, '');
	return slug === starlightDefault ? undefined : slug;
}

function transformFrontmatter(data, rel) {
	const out = { ...data };
	if (out.slug === '/') delete out.slug;
	if ('sidebar_position' in out) {
		out.sidebar = { ...(out.sidebar ?? {}), order: out.sidebar_position };
		delete out.sidebar_position;
	}
	if ('sidebar_label' in out) {
		out.sidebar = { ...(out.sidebar ?? {}), label: out.sidebar_label };
		delete out.sidebar_label;
	}
	if ('toc_min_heading_level' in out || 'toc_max_heading_level' in out) {
		out.tableOfContents = {
			minHeadingLevel: out.toc_min_heading_level ?? 2,
			maxHeadingLevel: out.toc_max_heading_level ?? 3,
		};
		delete out.toc_min_heading_level;
		delete out.toc_max_heading_level;
	}
	// Docusaurus shows a category's landing doc as the category header; in Starlight it is the group's first entry
	if (categoryLinkDocs.has(rel.replace(/\.mdx?$/, '').split(path.sep).join('/'))) {
		out.sidebar = { ...(out.sidebar ?? {}), order: 0 };
		count('category landing docs ordered first');
	}
	const slug = slugFor(rel);
	if (slug !== undefined) {
		out.slug = slug;
		count('slug overrides');
	}
	return out;
}

/** Rewrite an import specifier from the old docsite layout to the new one */
function rewriteSpecifier(spec, oldFile) {
	let s = spec;
	if (s.startsWith('!!raw-loader!')) {
		s = `${s.slice('!!raw-loader!'.length)}?raw`;
		count('raw-loader imports');
	}
	if (s.startsWith('.')) {
		// relative to the old file; re-express from the docusaurus root as an @site alias
		const [p, q = ''] = s.split('?');
		const abs = path.resolve(path.dirname(oldFile), p);
		const fromRoot = path.relative(docusaurusRoot, abs).split(path.sep).join('/');
		s = `@site/${fromRoot}${q ? `?${q}` : ''}`;
	}
	s = s.replace(/^@site\/docs\//, '@site/src/content/docs/');
	// non-partial .md docs become .mdx
	if (/^@site\/src\/content\/docs\/.*\.md$/.test(s) && !isPartialPath(s.replace('@site/src/content/docs/', ''))) s += 'x';
	return s;
}

const DROP_IMPORTS = ['@site/src/components/GenericConfiguration.mdx', '@theme/Admonition/Icon/Warning', '../../src/components/SchemaLink', '../../src/components/AIOExample', '../../src/components/FileExample', '@theme/Tabs', '@theme/TabItem', '@theme/CodeBlock', '@site/src/components/RemoteCodeBlock', '../../src/components/RemoteCodeBlock'];

function transformAdmonitions(body) {
	const lines = body.split('\n');
	const out = [];
	for (let i = 0; i < lines.length; i++) {
		const m = /^(\s*):{3,}(info|important|warning)(?:\[(.*)\])?\s*$/.exec(lines[i]);
		if (!m) {
			out.push(lines[i]);
			continue;
		}
		const [, indent, type, title] = m;
		let end = -1;
		for (let j = i + 1; j < lines.length; j++) {
			if (new RegExp(`^${indent}:{3,}\\s*$`).test(lines[j])) {
				end = j;
				break;
			}
		}
		if (end === -1) {
			out.push(lines[i]);
			count('admonitions left unconverted (no closing :::)');
			continue;
		}
		const titleAttr = title ? ` title=${JSON.stringify(title)}` : '';
		out.push(`${indent}<Aside type="${type}"${titleAttr}>`, '', ...lines.slice(i + 1, end), '', `${indent}</Aside>`);
		count(`admonition :::${type} -> <Aside>`);
		i = end;
	}
	return out.join('\n');
}

function transformBody(body, oldFile, rel, isMdx) {
	let b = body;

	// imports
	b = b.replace(/^import\s+([\s\S]*?)\s+from\s+(['"])(.+?)\2;?[ \t]*$/gm, (line, what, q, spec) => {
		if (DROP_IMPORTS.includes(spec)) {
			count('dropped (auto-imported) imports');
			return '';
		}
		return `import ${what} from ${q}${rewriteSpecifier(spec, oldFile)}${q};`;
	});

	// <CodeBlock title=.. language=..>{X}</CodeBlock> -> <Code code={X} lang=.. title=.. />
	b = b.replace(/<CodeBlock((?:\s+\w+=(?:"[^"]*"|\{(?:[^{}]|\{[^{}]*\})*\}))*)\s*>\s*\{([\s\S]*?)\}\s*<\/CodeBlock>/g, (_, attrs, expr) => {
		count('CodeBlock -> Code');
		return `<Code code={(${expr.trim()}).trim()}${attrs.replace(/\blanguage=/, 'lang=').replace(/\s+/g, ' ').replace(/\s+$/, '')} />`;
	});

	// RemoteCodeBlock -> RemoteCode (build-time)
	b = b.replace(/<RemoteCodeBlock\b/g, () => (count('RemoteCodeBlock -> RemoteCode'), '<RemoteCode'));

	// ```lang reference title=".."\n<github url>\n``` (docusaurus-theme-github-codeblock) -> <RemoteCode>
	b = b.replace(/^(\s*)```(\w+) reference(.*)\n\s*(https?:\/\/\S+)\n\s*```/gm, (_, indent, lang, meta, url) => {
		count('reference codeblock -> RemoteCode');
		return `${indent}<RemoteCode url="${url}" lang="${lang}"${meta.replace(/\s+$/, '')} />`;
	});

	// require('/img/x.png').default (static/ asset) -> base-aware public URL
	b = b.replace(/require\((['"])\/(.+?)\1\)\.default/g, (_, q, p) => (count('require() static assets'), `import.meta.env.BASE_URL + ${JSON.stringify(p)}`));

	b = transformAdmonitions(b);

	// `## Heading {#custom-id}` is left as-is: Sätteri's `headingAttributes` feature parses it, even in .mdx

	// className= on plain HTML elements -> class= (Astro does not map className on HTML elements)
	b = b.replace(/<([a-z][\w-]*)(\s[^<>]*?)\bclassName=/g, (_, tag, attrs) => (count('className -> class'), `<${tag}${attrs}class=`));

	// links to .md/.mdx files -> the URL Docusaurus generated for them
	b = b.replace(/\]\(((?!https?:)[^)\s#?]+\.mdx?)([#?][^)]*)?\)/g, (m, target, rest = '') => {
		const abs = target.startsWith('/') ? path.join(SRC, target) : path.resolve(path.dirname(oldFile), target);
		const targetRel = path.relative(SRC, abs);
		if (targetRel.startsWith('..')) return m;
		count('file links -> URLs');
		return `](${urlForDoc(targetRel)}${rest})`;
	});

	// interactive React islands need explicit hydration in Astro
	b = b.replace(/<(Carousel)\b(?![^>]*client:)/g, (_, c) => (count('client:only added'), `<${c} client:only="react"`));
	b = b.replace(/<(LocalStorageText)\b(?![^>]*client:)/g, (_, c) => (count('client:load added'), `<${c} client:load`));

	return b;
}

function migrateDoc(file, rel) {
	const raw = fs.readFileSync(file, 'utf8');
	const partial = isPartialPath(rel);
	// Docusaurus parses .md as MDX too; keep that behaviour by renaming non-partial .md to .mdx
	const outRel = !partial && rel.endsWith('.md') ? `${rel}x` : rel;
	const isMdx = outRel.endsWith('.mdx');
	const parsed = matter(raw);
	const hasFrontmatter = raw.startsWith('---');
	const data = partial ? parsed.data : transformFrontmatter(parsed.data, rel);
	const body = transformBody(parsed.content, file, rel, isMdx);
	const fm = hasFrontmatter || Object.keys(data).length > 0 ? `---\n${yaml.dump(data, { lineWidth: -1 })}---\n` : '';
	const dest = path.join(DEST, outRel);
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.writeFileSync(dest, fm + body);
	count(partial ? 'partials' : 'pages');
}

function migrateCategory(file, rel) {
	const cat = JSON.parse(fs.readFileSync(file, 'utf8'));
	const meta = {};
	if (cat.label) meta.label = cat.label;
	if (cat.position !== undefined) meta.order = cat.position;
	else if (cat.link?.type === 'doc') {
		// Docusaurus falls back to the landing doc's sidebar_position for the category's position
		const linkFile = ['.mdx', '.md'].map((e) => path.join(SRC, cat.link.id + e)).find((f) => fs.existsSync(f));
		const pos = linkFile && matter(fs.readFileSync(linkFile, 'utf8')).data.sidebar_position;
		if (pos !== undefined) meta.order = pos;
	}
	if (cat.collapsed !== undefined) meta.collapsed = cat.collapsed;
	const dest = path.join(DEST, path.dirname(rel), '_meta.yml');
	fs.mkdirSync(path.dirname(dest), { recursive: true });
	fs.writeFileSync(dest, yaml.dump(meta));
	count('_category_.json -> _meta.yml');
	if (cat.link?.type === 'generated-index') {
		// Docusaurus generated /category/<label>/; create a real page at the same URL
		const dir = path.dirname(rel);
		const pages = fs.readdirSync(path.join(SRC, dir)).filter((f) => /\.mdx?$/.test(f) && !f.startsWith('_'));
		const cards = pages
			.map((f) => {
				const { data } = matter(fs.readFileSync(path.join(SRC, dir, f), 'utf8'));
				return `  <LinkCard title=${JSON.stringify(data.title ?? stemOf(f))} href={import.meta.env.BASE_URL + ${JSON.stringify(urlForDoc(path.join(dir, f)).slice(1))}}${data.description ? ` description=${JSON.stringify(data.description)}` : ''} />`;
			})
			.join('\n');
		const slug = `category/${cat.label.toLowerCase().replace(/\s+/g, '-')}`;
		const page = `---\ntitle: ${JSON.stringify(cat.label)}\nslug: ${slug}\n${cat.link.description ? `description: ${JSON.stringify(cat.link.description)}\n` : ''}sidebar:\n  hidden: true\n---\nimport { LinkCard, CardGrid } from '@astrojs/starlight/components';\n\n${cat.link.description ?? ''}\n\n<CardGrid>\n${cards}\n</CardGrid>\n`;
		fs.writeFileSync(path.join(DEST, dir, 'generated-index.mdx'), page);
		count('generated-index pages');
	}
}

function walk(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const file = path.join(dir, entry.name);
		const rel = path.relative(SRC, file);
		if (entry.isDirectory()) {
			if (rel === 'api') continue;
			walk(file);
		} else if (entry.name === '_category_.json') migrateCategory(file, rel);
		else if (/\.mdx?$/.test(entry.name)) migrateDoc(file, rel);
		else {
			fs.mkdirSync(path.dirname(path.join(DEST, rel)), { recursive: true });
			fs.copyFileSync(file, path.join(DEST, rel));
			count('assets copied');
		}
	}
}

fs.rmSync(DEST, { recursive: true, force: true });
walk(SRC);
// shared MDX snippets live outside docs/ but need the same body transforms
const SNIPPETS = path.join(docusaurusRoot, 'src/components/snippets');
const SNIPPETS_DEST = path.join(root, 'src/components/snippets');
fs.rmSync(SNIPPETS_DEST, { recursive: true, force: true });
fs.mkdirSync(SNIPPETS_DEST, { recursive: true });
for (const f of fs.readdirSync(SNIPPETS)) {
	const file = path.join(SNIPPETS, f);
	fs.writeFileSync(path.join(SNIPPETS_DEST, f), transformBody(fs.readFileSync(file, 'utf8'), file, f, f.endsWith('.mdx')));
	count('snippets');
}
// static/ -> public/ (schemas, openapi.json and images are fetched/linked at runtime)
fs.rmSync(PUBLIC, { recursive: true, force: true });
fs.cpSync(path.join(docusaurusRoot, 'static'), PUBLIC, { recursive: true });
console.table(stats);
