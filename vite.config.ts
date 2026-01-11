import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'editor-vendor': ['@codemirror/view', '@codemirror/state', '@codemirror/lang-markdown'],
          'markdown-vendor': ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
})
