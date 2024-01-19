import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
        base: (process.env.BASE_URL ?? '/'),
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
