# docsite-starlight (POC)

Side-by-side Astro Starlight port of `../docsite`. Content is **generated** from the Docusaurus docs by a codemod, so edit `../docsite/docs`, not `src/content/docs`.

```bash
npm install
npm run migrate          # ../docsite/docs + snippets -> src/content/docs, ../docsite/static -> public
npm run build            # dist/
npm run dev              # http://localhost:3001/docs/
npm run preview          # serve dist/ on :3001

MD_PROCESSOR=unified npm run build -- --outDir dist-unified   # compare against the unified (remark) pipeline
```

- `scripts/migrate.mjs` – the codemod (frontmatter, slugs, `_category_.json` -> `_meta.yml`, admonitions -> `<Aside>`, `<CodeBlock>` -> `<Code>`, raw-loader -> `?raw`, file links -> URLs, ...). Prints a table of what it changed.
- `plugins/` – Sätteri base-path link plugin, root sidebar expansion, OpenAPI spec operationIds + redirects, Caddyfile grammar.
- `src/shims/` – stand-ins for the `@docusaurus/*` / `@theme/*` imports still used by the ported React components (aliased in `astro.config.mjs`).
