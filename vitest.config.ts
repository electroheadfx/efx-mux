import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/vite-env.d.ts',
        'src/**/*.test.{ts,tsx}',
        'src/main.tsx',
        'src/terminal/terminal-manager.ts',
        'src/terminal/pty-bridge.ts',
        'src/terminal/resize-handler.ts',
        'src/drag-manager.ts',
        'src/**/*.d.ts',
      ],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
      },
    },
  },
});
