import React from 'react';
import useBaseUrl from './useBaseUrl';

export default function Link({ to, href, ...rest }: { to?: string | null; href?: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
	const dest = to ?? href;
	const url = dest && dest.startsWith('/') ? useBaseUrl(dest) : dest ?? undefined;
	return <a href={url} {...rest} />;
}
