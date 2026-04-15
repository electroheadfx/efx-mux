import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      ignored: [
        '**/src-tauri/**',
        '**/.git/**',
        '**/.planning/**',
        '**/.claude/**',
        '**/.github/**',
        '**/RESEARCH/**',
        '**/node_modules/**',
        '**/repomix-output.*',
        '**/CLAUDE.md',
        '**/README.md',
        '**/pnpm-lock.yaml',
        '**/package-lock.json',
      ],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: 'safari16',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
