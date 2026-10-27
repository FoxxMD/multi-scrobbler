/** Prefix a site-relative path with the docs base path. Works whether or not BASE_URL has a trailing slash. */
export function withBase(path: string): string {
	return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
