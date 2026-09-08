import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  esbuild: {
    // Strip debug logging from production builds. The app shipped ~44
    // console.log calls, several of which printed API responses and
    // supplier contact details into the browser console.
    // console.warn / console.error are kept for real diagnostics.
    // `pure` lets the minifier drop these calls in production builds only;
    // they still work during `npm run dev`.
    pure: ['console.log', 'console.debug'],
  },
  build: {
    rollupOptions: {
      output: {
        // Heavy libraries are shared by several lazily-loaded routes, so
        // Rollup was hoisting them into the entry chunk. Split them out so
        // the initial load does not pull down the spreadsheet and charting
        // stacks the first screen never uses.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('exceljs')) return 'vendor-exceljs'
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts'
          if (id.includes('react-markdown') || id.includes('remark') ||
              id.includes('micromark') || id.includes('mdast') ||
              id.includes('hast') || id.includes('unist')) return 'vendor-markdown'
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (id.includes('/react/') || id.includes('/react-dom/') ||
              id.includes('/react-router') || id.includes('scheduler')) return 'vendor-react'
        }
      }
    }
  }
})
