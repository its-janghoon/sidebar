import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Forge serves Custom UI from a relative path, so assets must use './'.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'build', emptyOutDir: true },
});
