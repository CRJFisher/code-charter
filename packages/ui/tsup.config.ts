import { defineConfig } from 'tsup'

export default defineConfig([
  // Library build (for npm packages)
  {
    entry: ['src/index.tsx'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    external: ['react', 'react-dom'],
    outDir: 'dist',
  },
  // Standalone build (for VSCode webview and browser)
  {
    entry: { standalone: 'src/standalone.tsx' },
    format: ['iife'],
    outDir: 'dist',
    globalName: 'CodeCharterUI',
    platform: 'browser',
    bundle: true,
    minify: process.env.NODE_ENV === 'production',
    sourcemap: true,
    // Bundle everything including React
    noExternal: [/(.*)/],
    loader: {
      '.css': 'css',
    },
    esbuildOptions(options) {
      options.define = {
        'process.env.NODE_ENV': '"production"',
      }
    },
  }
])