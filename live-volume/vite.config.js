import { defineConfig } from 'vite';

// The exchanges' REST APIs reject browser requests from localhost or send no CORS headers,
// so the app calls /<exchange>/... and the dev server forwards it without the browser's Origin.
const targets = {
  '/bingx': 'https://open-api.bingx.com',
  '/binance': 'https://fapi.binance.com',
  '/bybit': 'https://api.bybit.com',
  '/okx': 'https://www.okx.com',
};

const proxy = Object.fromEntries(
  Object.entries(targets).map(([prefix, target]) => [
    prefix,
    {
      target,
      changeOrigin: true,
      rewrite: path => path.slice(prefix.length),
      configure: server =>
        server.on('proxyReq', proxyReq => {
          proxyReq.removeHeader('origin');
          proxyReq.removeHeader('referer');
        }),
    },
  ]),
);

export default defineConfig({
  server: { proxy },
  preview: { proxy },
});
