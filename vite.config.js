import { defineConfig } from 'vite'

export default defineConfig({
  base: '/peka-r/',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 800,
  },
  server: {
    host: true,
    port: 5173,
  },
})
