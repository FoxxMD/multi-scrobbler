// Client-side fallback for @theme/CodeBlock inside React islands. Build-time code blocks use Starlight's <Code>.
import React from 'react';

export interface Props {
	children?: string | null;
	title?: string;
	language?: string;
	className?: string;
}

export default function CodeBlock({ children, title }: Props) {
	return (
		<div className="expressive-code">
			<figure className={title ? 'frame has-title' : 'frame'}>
				{title && <figcaption className="header"><span className="title">{title}</span></figcaption>}
				<pre><code>{children}</code></pre>
			</figure>
		</div>
	);
}
