import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
export default defineConfig({
  plugins: [react()], base: './',
  build: { outDir: 'dist', rollupOptions: { input: { review: resolve(__dirname, 'review.html'), popup: resolve(__dirname, 'popup.html') } } },
})
