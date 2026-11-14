import { availableParallelism } from 'node:os';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Most test files start their own PostGIS and Redis containers, so at most four files run at once.
    // Never more than Vitest's own default (cores - 1), so a small CI runner keeps its lower number.
    maxWorkers: Math.min(4, Math.max(availableParallelism() - 1, 1)),
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
  // Vitest's own transform does not emit the decorator metadata that NestJS needs.
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2023',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
