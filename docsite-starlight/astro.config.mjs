// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import { unified } from '@astrojs/markdown-remark';
import codeblocks from 'starlight-codeblocks';
import starlightAutoSidebar from 'starlight-auto-sidebar';
import starlightOpenAPI, { openAPISidebarGroups } from 'starlight-openapi';
import AutoImport from 'astro-auto-import';
import { satteriBaseLinks } from './plugins/satteriBaseLinks.mjs';
import { rootSidebar } from './plugins/rootSidebar.mjs';
import { readFileSync } from 'node:fs';
import { prepareSpec, apiRedirects } from './plugins/openapiSpec.mjs';

// Caddyfile grammar from https://github.com/caddyserver/vscode-caddyfile (MIT, see plugins/caddyfile.LICENSE)
const caddyfile = {
  ...JSON.parse(readFileSync(new URL('./plugins/caddyfile.tmLanguage.json', import.meta.url), 'utf8')),
  name: 'caddyfile',
  aliases: ['Caddyfile', 'caddy'],
};

// POC switch: MD_PROCESSOR=unified to compare against the default Sätteri pipeline
const useUnified = process.env.MD_PROCESSOR === 'unified';

// same precedence as the Docusaurus config: explicit env, then Netlify / Cloudflare Pages deploy URLs
const site =
  [process.env.BASE_SITE, process.env.DEPLOY_PRIME_URL, process.env.CF_PAGES_URL].find((x) => x !== undefined && x.trim() !== '') ??
  'https://foxxmd.github.io';

// analytics + search console verification, only when configured
const head = [];
if (process.env.GSITEVERIFICATION?.trim()) {
  head.push({ tag: 'meta', attrs: { name: 'google-site-verification', content: process.env.GSITEVERIFICATION } });
}
if (process.env.RY_ANALYTICS?.trim()) {
  head.push({
    tag: 'script',
    attrs: { src: process.env.RY_ANALYTICS, defer: true, ...(process.env.RY_ANALYTICS_SITEID ? { 'data-site-id': process.env.RY_ANALYTICS_SITEID } : {}) },
  });
}
const base = process.env.DOCS_BASE !== undefined && process.env.DOCS_BASE !== '' ? process.env.DOCS_BASE : '/docs';

const comp = (p) => `./src/components/${p}`;

const specPath = new URL('./.astro/openapi.json', import.meta.url);
const apiSlugs = prepareSpec(new URL('../docsite/static/openapi.json', import.meta.url), specPath);

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  markdown: {
    processor: useUnified
      ? unified()
      : satteri({
          // native `## Heading {#custom-id}` support, works unescaped in .mdx
          features: { headingAttributes: true },
          hastPlugins: [satteriBaseLinks(base)],
        }),
  },
  // Astro does not prefix redirect destinations with `base`, so do it here
  redirects: {
    ...Object.fromEntries(
    Object.entries({
      '/docs/configuration': '/configuration/',
      '/docs/configuration/kitchensink': '/configuration/kitchensink/',
      '/docs/installation': '/installation/',
      '/docs/quickstart': '/quickstart/',
      '/docs/FAQ': '/FAQ/',
      '/docs': '/',
    }).map(([from, to]) => [from, `${base.replace(/\/$/, '')}${to}`]),
    ),
    ...apiRedirects(apiSlugs, base),
  },
  integrations: [
    // must come before mdx (added by starlight) so imports are injected into .mdx
    AutoImport({
      imports: [
        { '@astrojs/starlight/components': ['Code'] },
        { 'starlight-codeblocks/components': ['CodeWalkthrough'] },
        { [comp('Tabs.astro')]: [['default', 'Tabs']] },
        { [comp('TabItem.astro')]: [['default', 'TabItem']] },
        { [comp('Aside.astro')]: [['default', 'Aside']] },
        { [comp('DetailsAdmo.astro')]: [['default', 'DetailsAdmo']] },
        { [comp('GenericConfiguration.mdx')]: [['default', 'Config']] },
        { [comp('AIOExample.astro')]: [['default', 'AIOExample']] },
        { [comp('RemoteCode.astro')]: [['default', 'RemoteCode']] },
        { [comp('SchemaLink.tsx')]: [['default', 'SchemaLink']] },
        { [comp('Capability.tsx')]: ['Cap', 'CapabilityLegend'] },
        { [comp('Button.tsx')]: [['default', 'Button']] },
        { [comp('ButtonGroup.tsx')]: [['default', 'ButtonGroup']] },
        { [comp('snippets/_env-config.mdx')]: [['default', 'EnvType']] },
        { [comp('snippets/_file-config.mdx')]: [['default', 'FileType']] },
        { [comp('snippets/_aio-config.mdx')]: [['default', 'AIOType']] },
      ],
    }),
    starlight({
      title: 'Multi-Scrobbler',
      head,
      logo: { src: './src/assets/icon.svg' },
      favicon: '/img/favicon.ico',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/foxxmd/multi-scrobbler' }],
      editLink: { baseUrl: 'https://github.com/FoxxMD/multi-scrobbler/blob/master/docsite/' },
      expressiveCode: { shiki: { langs: [caddyfile] } },
      customCss: ['./src/styles/custom.css', './src/styles/capability.css'],
      routeMiddleware: './src/routeData.ts',
      components: {
        // POC: default to dark theme when the reader hasn't picked one
        ThemeProvider: './src/components/overrides/ThemeProvider.astro',
        SocialIcons: './src/components/overrides/SocialIcons.astro',
        Footer: './src/components/overrides/Footer.astro',
      },
      plugins: [
        codeblocks({
          notation: { comments: { json: ['//'], text: ['<--', '#'], caddyfile: ['#'] } },
          placeholders: { storage: 'session' },
          expandable: { lines: 12, auto: 30 },
        }),
        starlightAutoSidebar(),
        starlightOpenAPI([
          {
            base: 'api',
            schema: fileURLToPath(specPath),
            sidebar: { label: 'API' },
          },
        ]),
      ],
      sidebar: [
        ...rootSidebar(fileURLToPath(new URL('./src/content/docs', import.meta.url))),
        { label: 'Config Playground', link: '/playground/' },
        ...openAPISidebarGroups,
      ],
    }),
    react(),
    // explicit (Starlight would add it itself): astro-auto-import skips setup if MDX isn't registered yet when its hook runs
    mdx(),
  ],
  vite: {
    resolve: {
      alias: [
        // POC shims so ported React components keep their Docusaurus imports unchanged
        ...Object.entries({
          '@docusaurus/BrowserOnly': 'BrowserOnly.tsx',
          '@docusaurus/ErrorBoundary': 'ErrorBoundary.tsx',
          '@docusaurus/ExecutionEnvironment': 'ExecutionEnvironment.ts',
          '@docusaurus/useBaseUrl': 'useBaseUrl.ts',
          '@docusaurus/Link': 'Link.tsx',
          '@docusaurus/theme-common': 'theme-common/index.ts',
          '@theme/CodeInline': 'CodeInline.tsx',
          '@theme/CodeBlock': 'CodeBlock.tsx',
          '@theme/Admonition': 'Admonition.tsx',
        }).map(([find, file]) => ({ find: new RegExp(`^${find}$`), replacement: fileURLToPath(new URL(`./src/shims/${file}`, import.meta.url)) })),
        // static/ stays the source of truth for build-time imports (schemas, example config)
        { find: /^@site\/static\//, replacement: fileURLToPath(new URL('../docsite/static/', import.meta.url)) },
        // `@site/..` in docusaurus content points at the repo root (config examples, etc.)
        { find: /^@site\/\.\.\//, replacement: fileURLToPath(new URL('../', import.meta.url)) },
        { find: /^@site\//, replacement: fileURLToPath(new URL('./', import.meta.url)) },
      ],
    },
    server: {
       fs: { allow: ['..'] },
       allowedHosts: true
      },
  },
});
