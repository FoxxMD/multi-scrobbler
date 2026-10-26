// Stand-in for @docusaurus/useBaseUrl
export default function useBaseUrl(path: string): string {
	return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
