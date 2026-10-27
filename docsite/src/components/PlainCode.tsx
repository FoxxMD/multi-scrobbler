// Unhighlighted code block for React islands, styled like Expressive Code. Build-time code blocks use Starlight's <Code>.
import React from 'react';

export interface PlainCodeProps {
	children?: string | null;
	title?: string;
	language?: string;
	className?: string;
}

export default function PlainCode({ children, title }: PlainCodeProps) {
	return (
		<div className="expressive-code">
			<figure className={title ? 'frame has-title' : 'frame'}>
				{title && <figcaption className="header"><span className="title">{title}</span></figcaption>}
				<pre><code>{children}</code></pre>
			</figure>
		</div>
	);
}
