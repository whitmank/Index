import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],

  // Use relative paths for Electron production builds
  // This ensures assets load correctly with file:// protocol
  base: mode === 'electron' ? './' : '/',

  server: {
    proxy: {
      // Proxy API requests to backend during development
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },

  build: {
    // Ensure assets directory is explicit
    assetsDir: 'assets',

    // Optimize for Electron
    rollupOptions: {
      output: {
        // Avoid dynamic imports that might fail with file:// protocol
        manualChunks: undefined
      }
    }
  }
}))
