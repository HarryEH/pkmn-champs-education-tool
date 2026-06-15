import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [react()],
  // The @pkmn/* and @smogon/calc packages are ESM with deep imports; let Vite
  // pre-bundle them so deep paths (e.g. @smogon/calc/dist/adaptable) resolve
  // cleanly in dev.
  optimizeDeps: {
    include: [
      '@pkmn/dex',
      '@pkmn/data',
      '@pkmn/sets',
      '@pkmn/img',
      '@pkmn/smogon',
      '@smogon/calc/dist/adaptable',
    ],
  },
});
