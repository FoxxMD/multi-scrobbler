// Replaces Docusaurus' Prism fenced code blocks with Expressive Code + the starlight-codeblocks preset.
// Only fenced blocks in Markdown/MDX are affected; JSX <CodeBlock> still renders with Prism.
//
// Load this with a native require (see docusaurus.config.ts): Docusaurus loads its config with jiti,
// which transpiles Shiki's lazy theme/grammar import()s to CJS and breaks them.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from '@expressive-code/core/hast';
import rehypeExpressiveCode, { createRenderer, MetaOptions } from 'rehype-expressive-code';
import { rolldown } from 'rolldown';
import { bundledLanguagesInfo } from 'shiki/langs';
import { pluginCodeblocks } from 'starlight-codeblocks/expressive-code';

// Same options as starlight-codeblocks' `codeblocks({...})`, e.g. `expandable: { lines: 12, auto: 30 }`.
// See https://ewels.github.io/starlight-codeblocks/reference/configuration/
const codeblocksOptions = {
  // allow `// [!code ...]` notation in plain json blocks
  // and `<-- [!ref] ...` or `# [!ref] ...` annotations in plain text blocks
  notation: { comments: { json: ['//'], text: ['<--', '#'], caddyfile: ['#'] } },
  placeholders: {
    storage: 'session'
  }
};

// Caddyfile grammar from https://github.com/caddyserver/vscode-caddyfile (MIT, see caddyfile.LICENSE).
// Shiki has no bundled Caddyfile language. The grammar's heredoc rules include css/js/json/html/xml;
// those are not declared as embeddedLangs (Shiki would require them preloaded), so heredoc bodies render unhighlighted.
const caddyfile = {
  ...JSON.parse(readFileSync(new URL('./caddyfile.tmLanguage.json', import.meta.url), 'utf8')),
  name: 'caddyfile',
  aliases: ['Caddyfile', 'caddy'],
};

// Expressive Code's own options (defaultProps, styleOverrides, frames, ...) go here.
// See https://expressive-code.com/reference/configuration/
export const ecOptions = {
  // match the Prism themes used previously (github / dracula)
  themes: ['dracula', 'github-light'],
  // follow Docusaurus' <html data-theme="dark|light"> instead of prefers-color-scheme
  themeCssSelector: (theme) => `[data-theme='${theme.type}']`,
  useDarkModeMediaQuery: false,
  shiki: { langs: [caddyfile] },
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

// Port of starlight-codeblocks' <CodeWalkthrough> (src/components/CodeWalkthrough.astro). Its build step
// (steps.ts `codeWalkthrough()`) and client (walkthrough-client.ts) are reused as-is, but the package only ships
// them as TypeScript source, which Node will not strip types from inside node_modules, so rolldown bundles them.
// `<CodeWalkthrough>` in MDX needs no import: the rehype plugin below replaces it at compile time.
const scbSrc = createRequire(import.meta.url).resolve('starlight-codeblocks').replace(/dist\/index\.mjs$/, 'src/');
const walkthroughDir = new URL('../../.docusaurus/expressive-code-walkthrough/', import.meta.url).pathname;
const bundle = async (input, platform, output) => (await rolldown({
  input: scbSrc + input,
  platform,
  // server bundle keeps packages external, they resolve from the docsite's node_modules
  ...(platform === 'node' && { external: (id) => !id.startsWith('.') && !id.startsWith('/') }),
})).write(output);
let walkthroughSteps;
const loadWalkthroughSteps = () => walkthroughSteps ??= bundle('components/steps.ts', 'node', { file: `${walkthroughDir}steps.mjs` })
  .then(() => import(`${walkthroughDir}steps.mjs`));

const walkthroughCss = `${readFileSync(createRequire(import.meta.url).resolve('@shikijs/magic-move/style.css'), 'utf8')}
.scb-steps { container-type: inline-size; margin-bottom: var(--ifm-leading); }
.scb-steps > .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
@media screen and (scripting: enabled) {
  .scb-steps > .expressive-code { margin-top: 0; }
  .scb-steps > .expressive-code:not(.scb-steps-current) { display: none; }
}
`;

// React escapes <script> children, which would break the steps' JSON, so set it with dangerouslySetInnerHTML instead
const jsonScript = (json) => ({
  type: 'mdxJsxFlowElement',
  name: 'script',
  attributes: [
    { type: 'mdxJsxAttribute', name: 'type', value: 'application/json' },
    {
      type: 'mdxJsxAttribute',
      name: 'dangerouslySetInnerHTML',
      value: {
        type: 'mdxJsxAttributeValueExpression',
        value: `{__html: ${JSON.stringify(json)}}`,
        data: { estree: { type: 'Program', sourceType: 'module', body: [{ type: 'ExpressionStatement', expression: { type: 'ObjectExpression', properties: [
          { type: 'Property', kind: 'init', method: false, shorthand: false, computed: false, key: { type: 'Identifier', name: '__html' }, value: { type: 'Literal', value: json } },
        ] } }] } },
      },
    },
  ],
  children: [],
});

const rehypeCodeWalkthrough = () => async (tree) => {
  const found = [];
  const visit = (node) => node.children?.forEach((child, i) => {
    if (child.type === 'mdxJsxFlowElement' && child.name === 'CodeWalkthrough') found.push([node, i]);
    else visit(child);
  });
  visit(tree);
  if (found.length === 0) return;
  const { codeWalkthrough, plainSteps } = await loadWalkthroughSteps();
  const transform = codeblocksOptions.walkthrough === false ? plainSteps : codeWalkthrough;
  for (const [parent, i] of found) {
    const root = fromHtml(transform(toHtml({ type: 'root', children: parent.children[i].children })), { fragment: true });
    const steps = root.children.find((node) => node.properties?.dataScbSteps !== undefined);
    const script = steps?.children.findIndex((node) => node.tagName === 'script') ?? -1;
    if (script !== -1) steps.children[script] = jsonScript(steps.children[script].children[0]?.value ?? '[]');
    parent.children.splice(i, 1, ...root.children);
  }
};

export const remarkPlugins = [remarkCodeTabs];

export const rehypePlugins = [
  [rehypeExpressiveCode, {
    ...ecOptions,
    customCreateRenderer: async () => ({ ...(await renderer), baseStyles: '', themeStyles: '', jsModules: [] }),
  }],
  rehypeCodeWalkthrough,
  rehypeEcExplicitJsx,
];

// Add this to the site's `staticDirectories` so Docusaurus serves (dev) and copies (build) it
export const ecStaticDir = new URL('../../.docusaurus/expressive-code/', import.meta.url).pathname;

// Writes the page-level CSS/JS once as content-hashed static files that every page links to
export async function expressiveCodePlugin(context) {
  const { baseStyles, themeStyles, jsModules } = await renderer;
  const walkthroughJs = codeblocksOptions.walkthrough === false ? ''
    : (await bundle('components/walkthrough-client.ts', 'browser', { format: 'iife', minify: true, file: `${walkthroughDir}client.js` })).output[0].code;
  const files = { css: baseStyles + themeStyles + walkthroughCss, js: [...jsModules, walkthroughJs].join('\n') };
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
