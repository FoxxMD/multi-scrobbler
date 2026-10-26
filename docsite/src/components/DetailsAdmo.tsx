// React twin of DetailsAdmo.astro for use inside islands (e.g. the playground)
import React, { type ReactNode } from 'react';
import { asideIcons } from './asideIcons';

export default function DetailsAdmo({ type, summary, render = true, children }: { type?: string; summary: ReactNode; render?: boolean; children?: ReactNode }) {
	if (!render) return null;
	const icon = type === undefined ? undefined : asideIcons[type];
	return (
		<details className={['starlight-aside', 'details-admo', type ? `starlight-aside--${type}` : 'details-admo--plain'].join(' ')}>
			<summary className="starlight-aside__title">
				{icon && <svg className="starlight-aside__icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d={icon} /></svg>}
				{summary}
			</summary>
			<div className="starlight-aside__content">{children}</div>
		</details>
	);
}
