import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests cover pure logic only (no React Native runtime).
export default defineConfig({
  // React Native's build-time flag; tests run as a development build.
  define: { __DEV__: 'true' },
  resolve: {
    alias: { '@': path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src') },
  },
  test: {
    name: 'mobile',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
