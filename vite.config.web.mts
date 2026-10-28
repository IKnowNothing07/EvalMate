import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
// Website build: one page (index.html) -> docs/ (GitHub Pages "Deploy from a branch: /docs"). Relative base so it works under /<repo>/.
export default defineConfig({ plugins: [react()], base: './', build: { outDir: 'docs', emptyOutDir: true, rollupOptions: { input: { index: resolve(__dirname, 'index.html') } } } })
