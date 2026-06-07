import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'client/src/**/*.{ts,tsx}'],
      exclude: [
        'src/index.ts',
        'src/adapters/types.ts',
        'src/constants.ts',
        'client/src/constants.ts',
        'client/src/main.tsx',
        '**/*.test.{ts,tsx}',
        'vitest.config.ts',
        'vite.config.ts',
      ],
    },
  },
})
