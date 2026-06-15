import { defineConfig } from 'vitest/config';

// The renderer is JSX; use esbuild's automatic runtime so tests need no React import.
export default defineConfig({ esbuild: { jsx: 'automatic' } });
