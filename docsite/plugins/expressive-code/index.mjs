// Replaces Docusaurus' Prism fenced code blocks with Expressive Code + the starlight-codeblocks preset.
// Only fenced blocks in Markdown/MDX are affected; JSX <CodeBlock> still renders with Prism.
//
// Load this with a native require (see docusaurus.config.ts): Docusaurus loads its config with jiti,
// which transpiles Shiki's lazy theme/grammar import()s to CJS and breaks them.
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import rehypeExpressiveCode, { createRenderer, MetaOptions } from 'rehype-expressive-code';
import { bundledLanguagesInfo } from 'shiki/langs';
import { pluginCodeblocks } from 'starlight-codeblocks/expressive-code';

// Same options as starlight-codeblocks' `codeblocks({...})`, e.g. `expandable: { lines: 12, auto: 30 }`.
// See https://ewels.github.io/starlight-codeblocks/reference/configuration/
const codeblocksOptions = {
  // allow `// [!code ...]` notation in plain json blocks
  notation: { comments: { json: ['//'] } },
};

// Expressive Code's own options (defaultProps, styleOverrides, frames, ...) go here.
// See https://expressive-code.com/reference/configuration/
export const ecOptions = {
  // match the Prism themes used previously (github / dracula)
  themes: ['dracula', 'github-light'],
  // follow Docusaurus' <html data-theme="dark|light"> instead of prefers-color-scheme
  themeCssSelector: (theme) => `[data-theme='${theme.type}']`,
  useDarkModeMediaQuery: false,
  plugins: pluginCodeblocks(codeblocksOptions),
};

// One renderer for the whole site. Its page-level CSS/JS are written once as static files
// by the Docusaurus plugin below, so the rehype plugin must not inline them per page.
const renderer = createRenderer(ecOptions);

// Mark EC output as explicit JSX so MDX does not swap its <pre>/<code>/<a>... for @theme/MDXComponents
const rehypeEcExplicitJsx = () => (tree) => {
  const mark = (node, inside) => {
    const isEc = node.type === 'element' && node.properties?.className?.includes?.('expressive-code');
    if (node.type === 'element' && (inside || isEc)) node.data = { ...node.data, _mdxExplicitJsx: true };
    for (const child of node.children ?? []) mark(child, inside || isEc);
  };
  mark(tree, false);
};

// Port of starlight-codeblocks' `:::code-tabs` transform (src/satteri/index.ts `codeTabs()`), which
// it only wires up inside its Astro integration. Docusaurus already parses directives (remark-directive).
// Wraps the fences in a `.scb-tabs` div and gives each the `scbTabs` meta that pluginCodeTabs() reads.
const languageName = (lang) => {
  if (!lang) return 'Plain text';
  return bundledLanguagesInfo.find((info) => info.id === lang || info.aliases?.includes(lang))?.name ?? lang;
};
// `diff lang="py"` renders as Python
const fenceLanguage = (code) => (code.lang === 'diff' && new MetaOptions(code.meta ?? '').getString('lang')) || code.lang;

const remarkCodeTabs = () => (tree, file) => {
  const visit = (node) => {
    node.children?.forEach((child, i) => {
      if (child.type === 'containerDirective' && child.name === 'code-tabs') node.children[i] = codeTabs(child, file.path);
      else visit(child);
    });
  };
  visit(tree);
};

function codeTabs(node, path) {
  const codes = node.children;
  if (codes.length === 0 || codes.some((child) => child.type !== 'code')) {
    throw new Error(`${path}: \`:::code-tabs\` can contain only fenced code blocks, and needs at least one.`);
  }
  const labels = codes.map((code) => new MetaOptions(code.meta ?? '').getString('label') ?? languageName(fenceLanguage(code)));
  const repeated = labels.find((label, i) => labels.indexOf(label) !== i);
  if (repeated !== undefined) {
    throw new Error(`${path}: two variants in a \`:::code-tabs\` have the label "${repeated}". Give each variant a different \`label="…"\`.`);
  }
  const control = node.attributes?.control ?? codeblocksOptions.codeTabs?.control ?? 'tabs';
  if (control !== 'tabs' && control !== 'menu') {
    throw new Error(`${path}: \`:::code-tabs\` has \`control="${control}"\`. Use \`control="tabs"\` or \`control="menu"\`.`);
  }
  return {
    type: 'paragraph',
    data: {
      hName: 'div',
      hProperties: {
        className: ['scb-tabs'],
        dataScbCodeTabs: node.attributes?.sync ?? '',
        dataScbControl: control,
        dataScbLabels: JSON.stringify(labels),
      },
    },
    children: codes.map((code, index) => ({
      ...code,
      meta: `${code.meta ?? ''} scbTabs="${encodeURIComponent(JSON.stringify({ index, labels, control }))}"`.trim(),
    })),
  };
}

export const remarkPlugins = [remarkCodeTabs];

export const rehypePlugins = [
  [rehypeExpressiveCode, {
    ...ecOptions,
    customCreateRenderer: async () => ({ ...(await renderer), baseStyles: '', themeStyles: '', jsModules: [] }),
  }],
  rehypeEcExplicitJsx,
];

// Add this to the site's `staticDirectories` so Docusaurus serves (dev) and copies (build) it
export const ecStaticDir = new URL('../../.docusaurus/expressive-code/', import.meta.url).pathname;

// Writes the page-level CSS/JS once as content-hashed static files that every page links to
export async function expressiveCodePlugin(context) {
  const { baseStyles, themeStyles, jsModules } = await renderer;
  const files = { css: baseStyles + themeStyles, js: jsModules.join('\n') };
  rmSync(ecStaticDir, { recursive: true, force: true });
  mkdirSync(`${ecStaticDir}ec`, { recursive: true });
  const urls = {};
  for (const [ext, content] of Object.entries(files)) {
    const name = `ec/ec.${createHash('sha256').update(content).digest('hex').slice(0, 8)}.${ext}`;
    writeFileSync(ecStaticDir + name, content);
    urls[ext] = context.baseUrl + name;
  }
  return {
    name: 'expressive-code',
    getClientModules: () => [new URL('./client.mjs', import.meta.url).pathname],
    injectHtmlTags: () => ({
      headTags: [{ tagName: 'link', attributes: { rel: 'stylesheet', href: urls.css } }],
      postBodyTags: [{ tagName: 'script', attributes: { type: 'module', src: urls.js } }],
    }),
  };
}
