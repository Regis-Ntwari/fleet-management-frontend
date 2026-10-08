import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// No manual vendor chunking. On Vite 8 (Rolldown) both `manualChunks` and
// `codeSplitting` groups that pulled React/Recharts into their own chunks created
// a circular import with the chunk holding the CommonJS runtime helper, which
// crashed the production bundle at startup ("t is not a function") before the
// login page rendered. Rolldown's default splitting (one chunk per lazy route plus
// shared chunks) is cycle-free and still caches well.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
})
