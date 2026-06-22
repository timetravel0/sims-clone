import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
  },
  plugins: [
    {
      name: 'sims-webgl-renderer-compat',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('/src/core/Game.js')) return null;
        return code.replace(
          'new THREE.WebGLRenderer({ antialias: true })',
          "new THREE.WebGLRenderer({ antialias: true, precision: 'mediump', powerPreference: 'default' })"
        );
      },
    },
  ],
});
