import { defineConfig } from 'vite';

export default defineConfig({
  // Development server configuration
  server: {
    port: 5173,
    open: false,
    cors: true,

    // Proxy API requests to the Node.js backend
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      }
    }
  },

  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: true,

    // Rollup options for bundling
    rollupOptions: {
      input: {
        main: 'index.html'
      },
      output: {
        // Chunk naming
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]'
      }
    }
  },

  // Dependency optimization
  optimizeDeps: {
    include: []
  },

  // Resolve aliases
  resolve: {
    alias: {
      '@': '/src',
      '@api': '/src/js/api',
      '@core': '/src/js/core',
      '@utils': '/src/js/utils',
      '@modules': '/src/js/modules'
    }
  }
});
