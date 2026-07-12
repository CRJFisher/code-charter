import { defineConfig } from 'tsup'

// Single build target: the standalone IIFE bundle the VSCode webview loads via
// window.CodeCharterUI. Nothing consumes this package as a library.
export default defineConfig([
  {
    entry: { standalone: 'src/standalone.tsx' },
    format: ['iife'],
    outDir: 'dist',
    clean: true,
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
