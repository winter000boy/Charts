import { defineConfig } from 'vite';

// BingX rejects browser requests from localhost, so the app calls /bingx/... and the dev server
// forwards it without the browser's Origin.
const proxy = {
  '/bingx': {
    target: 'https://open-api.bingx.com',
    changeOrigin: true,
    rewrite: path => path.slice('/bingx'.length),
    configure: server =>
      server.on('proxyReq', proxyReq => {
        proxyReq.removeHeader('origin');
        proxyReq.removeHeader('referer');
      }),
  },
};

export default defineConfig({
  server: { proxy },
  preview: { proxy },
});
