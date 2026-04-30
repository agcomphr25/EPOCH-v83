import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['client/src/__tests__/**/*.test.ts', 'client/src/__tests__/**/*.test.tsx'],
    globals: true,
    environmentMatchGlobs: [
      ['client/src/__tests__/**/*.component.test.tsx', 'jsdom'],
    ],
    setupFiles: ['client/src/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, 'shared'),
      '@': path.resolve(import.meta.dirname, 'client/src'),
      '@assets': path.resolve(import.meta.dirname, 'attached_assets'),
    },
  },
});
