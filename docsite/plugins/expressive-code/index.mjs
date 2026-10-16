// Replaces Docusaurus' Prism fenced code blocks with Expressive Code + the starlight-codeblocks preset.
// Only fenced blocks in Markdown/MDX are affected; JSX <CodeBlock> still renders with Prism.
//
// Load this with a native require (see docusaurus.config.ts): Docusaurus loads its config with jiti,
// which transpiles Shiki's lazy theme/grammar import()s to CJS and breaks them.
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import rehypeExpressiveCode, { createRenderer } from 'rehype-expressive-code';
import { pluginCodeblocks } from 'starlight-codeblocks/expressive-code';

export const ecOptions = {
  // match the Prism themes used previously (github / dracula)
  themes: ['dracula', 'github-light'],
  // follow Docusaurus' <html data-theme="dark|light"> instead of prefers-color-scheme
  themeCssSelector: (theme) => `[data-theme='${theme.type}']`,
  useDarkModeMediaQuery: false,
  plugins: pluginCodeblocks({
    // allow `// [!code ...]` notation in plain json blocks
    notation: { comments: { json: ['//'] } },
  }),
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
