/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

// Injected server-side per-request (src/backend/server/index.ts) since the
// hash-vs-browser router choice depends on the runtime BASE_URL, not the build.
interface Window {
    __MS_RUNTIME__?: { useHashRouter: boolean };
}
