/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
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
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    exclude: [
      'node_modules/**',
      'dist/**',
      // Exclude test files that export browser console functions
      // These contain 'describe/it' for Vitest AND exported functions for browser console
      'src/services/__tests__/encryptionService.test.ts',
      'src/services/__tests__/gunService.test.ts',
    ],
  },
})
