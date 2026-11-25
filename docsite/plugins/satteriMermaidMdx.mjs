/**
 * astro-mermaid (2.2.0) turns mermaid blocks into `{type: 'html'}` nodes, which Sätteri cannot compile in .mdx.
 * In .mdx, emit a JSX <pre class="mermaid"> first, so astro-mermaid's plugin never sees the block. .md files keep its html node.
 *
 * Remove this plugin (and its line in astro.config.mjs) once https://github.com/joesaby/astro-mermaid/issues/74
 * is resolved or https://github.com/joesaby/astro-mermaid/pull/92 is merged and released.
 */
export function satteriMermaidMdx() {
	return {
		name: 'satteri-mermaid-mdx',
		code(node, ctx) {
			if (node.lang !== 'mermaid' || !ctx?.fileURL?.pathname?.endsWith('.mdx')) return;
			return {
				type: 'mdxJsxFlowElement',
				name: 'pre',
				attributes: [
					{ type: 'mdxJsxAttribute', name: 'class', value: 'mermaid' },
					// as an attribute, not a text child, so the indents are kept
					{ type: 'mdxJsxAttribute', name: 'children', value: node.value },
				],
				children: [],
			};
		},
	};
}
