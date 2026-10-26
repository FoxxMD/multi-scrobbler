import React, { type ReactNode } from 'react';
export default function Admonition({ type = 'note', title, children }: { type?: string; title?: string; children?: ReactNode }) {
	return (
		<aside className={`starlight-aside starlight-aside--${type}`}>
			<p className="starlight-aside__title">{title ?? type}</p>
			<div className="starlight-aside__content">{children}</div>
		</aside>
	);
}
