// Release notes from GitHub (starlight-changelogs), shared by the content loader and the sidebar.
// Off by default so builds don't depend on the GitHub API; enable with DOCS_CHANGELOGS=true
// (docs deploy workflow, docsite/.env, or `--build-arg DOCS_CHANGELOGS=true` for Docker).
try {
	// Astro only exposes .env to import.meta.env, not to config files
	process.loadEnvFile();
} catch {
	// no .env
}

export const changelogsBase = 'updating/changelog';
export const changelogsEnabled = process.env.DOCS_CHANGELOGS === 'true';
