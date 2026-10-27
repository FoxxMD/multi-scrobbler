/**
 * Sätteri hast plugin for GitHub alerts (`> [!NOTE]` … `> [!CAUTION]`), used in the GitHub release notes that
 * starlight-changelogs renders. Turns the blockquote into the same markup as src/components/Aside.astro.
 * (starlight-github-alerts skips content rendered with the content loader's `renderMarkdown()`, which has no file path.)
 */
import { asideIcons, asideTitles } from '../src/components/asideIcons.ts';

const markerRegex = /^\s*\[!(note|tip|important|warning|caution)\]\s*/i;

const isElement = (node, tagName) => node?.type === 'element' && (tagName === undefined || node.tagName === tagName);
const isBlank = (node) => node.type === 'text' && node.value.trim() === '';

export function satteriGithubAlerts() {
	return {
		name: 'satteri-github-alerts',
		element: {
			filter: ['blockquote'],
			visit(node, ctx) {
				const children = [...node.children];
				const first = children.findIndex((child) => !isBlank(child));
				const paragraph = children[first];
				if (!isElement(paragraph, 'p')) return;
				const [text, ...rest] = paragraph.children;
				const match = text?.type === 'text' ? markerRegex.exec(text.value) : null;
				if (!match) return;

				const type = match[1].toLowerCase();
				let remaining = text.value.slice(match[0].length);
				// `[!NOTE]  ` (trailing spaces) is a hard line break after the marker
				if (remaining === '' && isElement(rest[0], 'br')) {
					rest.shift();
					if (rest[0]?.type === 'text') remaining = rest.shift().value.trimStart();
				}
				// `> [!NOTE]` alone on its first line becomes its own paragraph when followed by an empty `>` line
				const content =
					remaining === '' && rest.every(isBlank)
						? children.slice(first + 1)
						: [
								{ ...paragraph, children: [...(remaining === '' ? [] : [{ type: 'text', value: remaining }]), ...rest] },
								...children.slice(first + 1),
							];

				ctx.replaceNode(node, {
					type: 'element',
					tagName: 'aside',
					properties: { ariaLabel: asideTitles[type], className: ['starlight-aside', `starlight-aside--${type}`] },
					children: [
						{
							type: 'element',
							tagName: 'p',
							properties: { className: ['starlight-aside__title'], ariaHidden: 'true' },
							children: [
								{
									type: 'element',
									tagName: 'svg',
									properties: { className: ['starlight-aside__icon'], viewBox: '0 0 24 24', width: '16', height: '16', fill: 'currentColor' },
									children: [{ type: 'element', tagName: 'path', properties: { d: asideIcons[type] }, children: [] }],
								},
								{ type: 'text', value: asideTitles[type] },
							],
						},
						{ type: 'element', tagName: 'div', properties: { className: ['starlight-aside__content'] }, children: content },
					],
				});
			},
		},
	};
}
