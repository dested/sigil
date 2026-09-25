import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 7445,
    strictPort: true,
    proxy: { '/trpc': 'http://localhost:7444', '/files': 'http://localhost:7444' },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
