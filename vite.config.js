import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/]recharts[\\/]|[\\/]d3-/.test(id)) return 'charts'
          if (/[\\/]@mui[\\/]icons-material[\\/]/.test(id)) return 'icons'
          if (/[\\/](@mui|@emotion)[\\/]/.test(id)) return 'mui'
          if (/[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) return 'react'
          if (/[\\/](@tanstack|axios|zustand|zod)[\\/]/.test(id)) return 'data'
          return undefined
        },
      },
    },
  },
})
