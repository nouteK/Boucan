import { defineConfig } from 'vite';

// Explicit IPv4: on Windows "localhost" may resolve to ::1 only, while the game server listens on 0.0.0.0.
const server = `127.0.0.1:${process.env.BOUCAN_SERVER_PORT ?? 3001}`;

/** Dev: the game on :5180, WebSocket proxied to the game server (npm run dev at the root starts both). */
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5180,
    strictPort: true,
    proxy: {
      '/ws': { target: `ws://${server}`, ws: true },
      '/health': `http://${server}`,
    },
  },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1500 },
});
