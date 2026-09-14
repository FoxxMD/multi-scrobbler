/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

// Injected server-side per-request (src/backend/server/index.ts) with the
// runtime mount path
// this can't be a build-time constant since the same build
// is shipped for every deployment (root or subpath).
interface Window {
    __MS_RUNTIME__?: { basePath: string };
}
