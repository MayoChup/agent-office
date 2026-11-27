import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Penanda versi tiap build → aplikasi yang terbuka lama (PWA) tahu kalau ada versi baru dan menawarkan muat ulang. */
const VERSI = `${process.env.GITHUB_SHA || process.env.VERCEL_GIT_COMMIT_SHA || ''}`.slice(0, 12) || String(Date.now());

export default defineConfig({
    plugins: [
        react(),
        { name: 'versi-aplikasi', generateBundle() { this.emitFile({ type: 'asset', fileName: 'versi.json', source: JSON.stringify({ v: VERSI }) }); } }
    ],
    define: { __VERSI__: JSON.stringify(VERSI) },
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:3000',
        }
    },
    build: {
        outDir: 'dist'
    }
});
