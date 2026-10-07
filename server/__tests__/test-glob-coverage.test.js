import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const TEST_FILE_RE = /(\.test\.(js|jsx|ts|tsx)$)|([\\/]__tests__[\\/].+\.js$)/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', 'logs']);

const collectFiles = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        collectFiles(path.join(dir, entry.name), out);
      }
    } else if (TEST_FILE_RE.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
};

describe('test glob coverage', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

  it('keeps the jest/vitest roots locked to their documented scopes', async () => {
    expect(pkg.jest.testMatch).toEqual(['<rootDir>/server/__tests__/**/*.js']);
    expect(pkg.vitest).toBeUndefined();

    const vitestConfig = (await import('../../vitest.config.js')).default;
    expect(vitestConfig.test.include).toEqual(['src/**/*.test.{js,jsx,ts,tsx}']);
    expect(vitestConfig.test.environment).toBe('jsdom');
    expect(vitestConfig.test.coverage.provider).toBe('v8');
    expect(vitestConfig.test.coverage.include).toEqual(['src/**/*.{js,jsx}']);
    expect(vitestConfig.test.coverage.thresholds).toEqual({
      statements: 25,
      branches: 20,
      functions: 25,
      lines: 25,
    });
  });

  it('picks up every test file in the repo (no silent blind spots)', () => {
    const files = collectFiles(rootDir);
    expect(files.length).toBeGreaterThan(0);

    const uncovered = files.filter((file) => {
      const rel = path.relative(rootDir, file).replace(/\\/g, '/');
      const inJest = rel.startsWith('server/__tests__/') && rel.endsWith('.js');
      const inVitest = rel.startsWith('src/') && /\.test\.(js|jsx|ts|tsx)$/.test(rel);
      return !inJest && !inVitest;
    });

    expect(uncovered).toEqual([]);
  });
});
