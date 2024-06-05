import react from '@vitejs/plugin-react';
import normalizeUrl from "normalize-url";
import { defineConfig } from 'vite';

export const generateBaseURL = (userUrl: string | undefined): URL => {
    const base = normalizeUrl(userUrl, {removeSingleSlash: true});
    const u = new URL(base);
    if(u.port === '') {
        if(u.protocol === 'https:') {
            u.port = '443';
        } else if(userUrl.includes(`${u.hostname}:80`)) {
            u.port = '80';
        }
    }
    return u;
}

export default defineConfig(() => {
    let baseUrlStr = '/';
    if(process.env.BASE_URL !== undefined && process.env.BASE_URL !== '') {
        const baseUrl = generateBaseURL(process.env.BASE_URL);
        if(baseUrl.pathname !== '/') {
            baseUrlStr = baseUrl.toString();
        }
    }
    console.debug(`[VITE] BASE_URL ENV: ${process.env.BASE_URL} | Base Url String: ${baseUrlStr}`);
    return {
        base: baseUrlStr,
        plugins: [react()],
        build: {
            sourcemap: true
        },
        define: {
            "__APP_VERSION__": JSON.stringify((process.env.APP_VERSION ?? 'Unknown').toString()),
            "__USE_HASH_ROUTER__": JSON.stringify((process.env.USE_HASH_ROUTER ?? false))
        }
    };
});
