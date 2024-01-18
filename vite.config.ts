import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
        plugins: [react()],
        build: {
            sourcemap: true
        },
        define: {
            "__APP_VERSION__": JSON.stringify(process.env.APP_VERSION.toString() ?? 'Unknown')
        }
    };
});
