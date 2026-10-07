import { mergeConfig } from 'vite';
import viteConfig from './vite.config.js';

export default mergeConfig(viteConfig, {
  test: {
    include: ['src/**/*.test.{js,jsx,ts,tsx}'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      thresholds: {
        statements: 25,
        branches: 20,
        functions: 25,
        lines: 25,
      },
    },
  },
});
