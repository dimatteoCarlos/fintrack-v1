import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';

export default defineConfig({
  // Browser probes address port 5173 literally; strictPort makes an occupied port
  // fail loudly instead of silently moving the server to the next free one.
  server: {
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(),
    svgr({
      // svgr options: https://react-svgr.com/docs/options/
      svgrOptions: {
        exportType: 'default',
        ref: true,
        svgo: false,
        titleProp: true,
      },
      // Both forms: the bare import keeps existing icon imports working, and
      // '?react' is the only form that carries a React type, so an icon can take
      // a className.
      include: ['**/*.svg', '**/*.svg?react'],
    }),
  ],
});
