import react,{ reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { defineConfig } from 'vite';
import svgr from "vite-plugin-svgr";
import { visualizer } from "rollup-plugin-visualizer";
import { dirname, resolve } from 'node:path'

// Relative base so the built assets work from any mount path (root or a
// runtime-chosen subpath) without needing to know it at build time
//
// the server picks the actual mount path/router mode at runtime, see
// src/backend/server/index.ts and src/client/App.tsx.
export default defineConfig(({ mode }) => {
    return {
        server: {
            allowedHosts: (true as true),
            watch: {
                ignored: ['**/config/**']
            }
        },
        esbuild: {
            minifyIdentifiers: false
        },
        base: './',
        plugins: [
            react(),
                babel({
                presets: [reactCompilerPreset()]
    }),
            svgr(),
            // only for `npm run frontend:analyze`, writes module reports next to the throwaway build output
            ...(mode === 'analyze' ? [
                visualizer({ filename: 'node_modules/.cache/frontend-analyze/treemap.html', template: 'treemap', open: true }),
                //visualizer({ filename: 'node_modules/.cache/frontend-analyze/network.html', template: 'network'}),
            ] : [])
        ],
        build: {
            sourcemap: false,
            cssCodeSplit: true,
            rolldownOptions: {
                input: {
                    main: resolve(import.meta.dirname, 'index.html'),
                    // next: resolve(import.meta.dirname, 'next/index.html'),
                },
                //keepNames: true,
                sourcemap: false
            },
        },
        css: {
            preprocessorOptions: {
                scss: {
                    api: 'modern-compiler' // or "modern"
                }
            }
        },
        // for some reason vite is pulling in discord.js to dependencies when it doesn't need to
        optimizeDeps: {
            exclude: ['discord.js', 'zlib-sync', 'bufferutil', 'utf-8-validate', '@discordjs/opus'],
        },
        ssr: {
            external: ['discord.js'],
        },
    };
});
