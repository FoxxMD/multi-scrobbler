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
import starlightThemeGalaxy from 'starlight-theme-galaxy';
import starlightOpenAPI, { openAPISidebarGroups } from 'starlight-openapi';
import AutoImport from 'astro-auto-import';
import starlightChangelogs, { makeChangelogsSidebarLinks } from 'starlight-changelogs';
import { changelogsBase, changelogsEnabled } from './plugins/changelogs.mjs';
import { satteriBaseLinks } from './plugins/satteriBaseLinks.mjs';
import { satteriGithubAlerts } from './plugins/satteriGithubAlerts.mjs';
import { docsBase, codeblocksOptions } from './ec.config.mjs';
import { rootSidebar } from './plugins/rootSidebar.mjs';
import { prepareSpec, apiRedirects } from './plugins/openapiSpec.mjs';

// POC switch: MD_PROCESSOR=unified to compare against the default Sätteri pipeline
const useUnified = process.env.MD_PROCESSOR === 'unified';

// The app's own BASE_URL env var (set in the Dockerfile, possibly a full URL) would replace Astro's
// import.meta.env.BASE_URL (the docs base path) everywhere, so drop it; DOCS_BASE is derived from it beforehand.
delete process.env.BASE_URL;

// same precedence as the Docusaurus config: explicit env, then Netlify / Cloudflare Pages deploy URLs
const site =
  [process.env.BASE_SITE, process.env.DEPLOY_PRIME_URL, process.env.CF_PAGES_URL].find((x) => x !== undefined && x.trim() !== '') ??
  'https://foxxmd.github.io';

// analytics + search console verification, only when configured
/** @type {NonNullable<import('@astrojs/starlight/types').StarlightUserConfig['head']>} */
const head = [];
if (process.env.GSITEVERIFICATION?.trim()) {
  head.push({ tag: 'meta', attrs: { name: 'google-site-verification', content: process.env.GSITEVERIFICATION } });
}
if (process.env.RY_ANALYTICS?.trim()) {
  head.push({
    tag: 'script',
    attrs: { 
      src: process.env.RY_ANALYTICS,
      defer: true,
      'data-replay-block-selector': '.progress-scroll-container',
      ...(process.env.RY_ANALYTICS_SITEID ? { 'data-site-id': process.env.RY_ANALYTICS_SITEID } : {})
    },
  });
}
const base = docsBase;

const comp = (/** @type {string} */ p) => `./src/components/${p}`;

const specPath = new URL('./.astro/openapi.json', import.meta.url);
const apiSlugs = prepareSpec(new URL('./public/openapi.json', import.meta.url), specPath, base);

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  // same output dir as the Docusaurus site so the server, Dockerfile and deploy configs need no changes
  outDir: './build',
  markdown: {
    processor: useUnified
      ? unified()
      : satteri({
          // native `## Heading {#custom-id}` support, works unescaped in .mdx
          features: { headingAttributes: true },
          hastPlugins: [satteriBaseLinks(base), satteriGithubAlerts()],
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
        { './src/withBase.ts': ['withBase'] },
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
      customCss: ['./src/styles/custom.css', './src/styles/capability.css'],
      routeMiddleware: './src/routeData.ts',
      components: {
        // POC: default to dark theme when the reader hasn't picked one
        ThemeProvider: './src/components/overrides/ThemeProvider.astro',
        SocialIcons: './src/components/overrides/SocialIcons.astro',
        Footer: './src/components/overrides/Footer.astro',
      },
      plugins: [
        starlightThemeGalaxy(),
        codeblocks(codeblocksOptions),
        starlightAutoSidebar(),
        starlightOpenAPI([
          {
            base: 'api',
            schema: fileURLToPath(specPath),
            sidebar: { label: 'API' },
          },
        ]),
        starlightChangelogs(),
      ],
      sidebar: [
        ...rootSidebar(fileURLToPath(new URL('./src/content/docs', import.meta.url)), [
          { label: 'Config Playground', link: '/playground/', order: 5.5 },
          ...openAPISidebarGroups.map((group) => ({ ...group, order: 7.5 })),
        ], {
          updating: changelogsEnabled
            ? [{
                label: 'Changelog',
                collapsed: true,
                items: makeChangelogsSidebarLinks([
                  { type: 'all', base: changelogsBase, label: 'All versions' },
                  { type: 'recent', base: changelogsBase, count: 5 },
                ]),
              }]
            : [],
        }),
      ],
    }),
    react(),
    // explicit (Starlight would add it itself): astro-auto-import skips setup if MDX isn't registered yet when its hook runs
    mdx(),
  ],
  vite: {
    server: {
       fs: { allow: ['..'] },
       allowedHosts: true
      },
  },
});
