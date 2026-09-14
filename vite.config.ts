import react,{ reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { defineConfig } from 'vite';
import svgr from "vite-plugin-svgr";
import { dirname, resolve } from 'node:path'

// Relative base so the built assets work from any mount path (root or a
// runtime-chosen subpath) without needing to know it at build time
//
// the server picks the actual mount path/router mode at runtime, see
// src/backend/server/index.ts and src/client/App.tsx.
export default defineConfig(() => {
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
            svgr()
        ],
        build: {
            sourcemap: true,
            cssCodeSplit: true,
            rolldownOptions: {
                input: {
                    main: resolve(import.meta.dirname, 'index.html'),
                    // next: resolve(import.meta.dirname, 'next/index.html'),
                },
                keepNames: true,
                sourcemap: true
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
