// Stand-in for @docusaurus/BrowserOnly: render children() only after mount
import React, { useEffect, useState, type ReactNode } from 'react';

export default function BrowserOnly({ children, fallback = null }: { children: () => ReactNode; fallback?: ReactNode }) {
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	return <>{mounted ? children() : fallback}</>;
}
