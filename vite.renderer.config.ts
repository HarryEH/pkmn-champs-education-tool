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
    // transformers.js (R7 CLIP embedder, src/lib/detection/embedder.ts) ships a
    // browser build that lazily resolves onnxruntime-web's .wasm via import.meta.url
    // and uses top-level await; esbuild's dep pre-bundler mangles both. Excluding it
    // lets Vite serve the package as native ESM so the wasm URLs resolve correctly.
    exclude: ['@huggingface/transformers'],
  },
});
