// /apps/frontend/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  root: '.',
  plugins: [react(), tailwindcss(),],
  server: {
    host: '0.0.0.0',
    port: 3000,
    watch: { usePolling: true },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['date-fns', '@regloom/utils', '@regloom/types'],
  },
})