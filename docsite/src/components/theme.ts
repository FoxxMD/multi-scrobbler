// Theme/viewport hooks for React islands (were @docusaurus/theme-common)
import { useEffect, useState } from 'react';

const readTheme = () =>
	typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

/** Starlight sets <html data-theme="dark|light">; follow it live */
export function useColorMode(): { colorMode: 'light' | 'dark' } {
	const [colorMode, setColorMode] = useState<'light' | 'dark'>(readTheme);
	useEffect(() => {
		const observer = new MutationObserver(() => setColorMode(readTheme()));
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
		return () => observer.disconnect();
	}, []);
	return { colorMode };
}

/** Same contract as Docusaurus: 'desktop' at or above desktopBreakpoint, else 'mobile' ('ssr' before mount) */
export function useWindowSize({ desktopBreakpoint = 996 }: { desktopBreakpoint?: number } = {}): 'desktop' | 'mobile' | 'ssr' {
	const get = () => (typeof window === 'undefined' ? 'ssr' : window.innerWidth >= desktopBreakpoint ? 'desktop' : 'mobile');
	const [size, setSize] = useState<'desktop' | 'mobile' | 'ssr'>(get);
	useEffect(() => {
		const onResize = () => setSize(get());
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	}, [desktopBreakpoint]);
	return size;
}
