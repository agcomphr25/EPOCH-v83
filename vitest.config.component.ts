import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['client/src/__tests__/**/*.component.test.tsx'],
    globals: true,
    setupFiles: ['client/src/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'client', 'src'),
      '@shared': path.resolve(import.meta.dirname, 'shared'),
      '@assets': path.resolve(import.meta.dirname, 'attached_assets'),
    },
  },
});
