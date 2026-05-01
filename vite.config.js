import { defineConfig } from 'vite';

// GitHub Pages serves the project at /drifting-atelier/, but local dev
// (and `npm run preview`) uses /. Switch the base accordingly so absolute
// asset URLs resolve in both environments.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/drifting-atelier/' : '/',
  publicDir: 'assets',
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2020',
  },
}));
