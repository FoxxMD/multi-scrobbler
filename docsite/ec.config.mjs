// Expressive Code options live here (not in astro.config.mjs) because plugins aren't JSON-serializable,
// which the <Code> component requires.
import { defineEcConfig } from '@astrojs/starlight/expressive-code';
import { pluginCodeblocks } from 'starlight-codeblocks/expressive-code';
import { ecBaseLinks } from './plugins/satteriBaseLinks.mjs';
import caddyfileGrammar from './plugins/caddyfile.tmLanguage.json' with { type: 'json' };

export const docsBase = process.env.DOCS_BASE !== undefined && process.env.DOCS_BASE !== '' ? process.env.DOCS_BASE : '/docs';

/** shared with the starlight-codeblocks Starlight plugin in astro.config.mjs */
/** @type {import('starlight-codeblocks').CodeblocksOptions} */
export const codeblocksOptions = {
  notation: { comments: { json: ['//'], text: ['<--', '#'], caddyfile: ['#'] } },
  placeholders: { storage: 'session' },
  expandable: { lines: 12, auto: 30 },
};

// Caddyfile grammar from https://github.com/caddyserver/vscode-caddyfile (MIT, see plugins/caddyfile.LICENSE)
const caddyfile = {
  ...caddyfileGrammar,
  name: 'caddyfile',
  aliases: ['Caddyfile', 'caddy'],
};

export default defineEcConfig({
  shiki: { langs: [caddyfile] },
  // a `plugins` list here replaces the one starlight-codeblocks adds, so it must include its preset
  plugins: [pluginCodeblocks(codeblocksOptions, { base: docsBase }), ecBaseLinks(docsBase)],
});
