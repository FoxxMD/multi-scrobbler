// React twin of Aside.astro for use inside islands
import React, { type ReactNode } from 'react';
import { asideIcons, asideTitles } from './asideIcons';

export default function Aside({ type = 'note', title = asideTitles[type] ?? type, children }: { type?: string; title?: string; children?: ReactNode }) {
	const icon = asideIcons[type] ?? asideIcons.note;
	return (
		<aside aria-label={title} className={`starlight-aside starlight-aside--${type}`}>
			<p className="starlight-aside__title" aria-hidden="true">
				<svg className="starlight-aside__icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d={icon} /></svg>{title}
			</p>
			<div className="starlight-aside__content">{children}</div>
		</aside>
	);
}
