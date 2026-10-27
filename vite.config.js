import { defineConfig } from 'vite'

// Pages uses /peka-r/; the Capacitor APK build uses ./ so assets load offline.
const base = process.env.VITE_BASE ?? '/peka-r/'

export default defineConfig({
  base,
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: true,
    port: 5173,
  },
})
