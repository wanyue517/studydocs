import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Serve/bundle PDF.js fonts and decoders locally, including CJK and scanned PDFs.
// Keep these large assets out of the initial application and Markdown bundles.
function pdfAssets(): Plugin {
  const root = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
  const folders = ['cmaps', 'standard_fonts', 'wasm'];
  return {
    name: 'studydocs-pdf-assets',
    configureServer(server) {
      server.middlewares.use('/pdf-assets', async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0].split('/').filter(Boolean);
        if (path.length !== 2 || !folders.includes(path[0]) || !/^[\w.-]+$/.test(path[1])) return next();
        try {
          const data = await readFile(join(root, ...path));
          res.setHeader('Content-Type', path[1].endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
          res.end(data);
        } catch { next(); }
      });
    },
    async generateBundle() {
      for (const folder of folders) {
        for (const file of await readdir(join(root, folder), { withFileTypes: true })) {
          if (file.isFile()) this.emitFile({ type: 'asset', fileName: `pdf-assets/${folder}/${file.name}`, source: await readFile(join(root, folder, file.name)) });
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [vue(), pdfAssets()],
  build: {
    rollupOptions: {
      output: {
        // Many deployed MIME tables treat .mjs as application/octet-stream.
        // Keep the module contents intact, but serve the Worker with a .js URL.
        assetFileNames(asset) {
          return asset.names.some((name) => name.endsWith('pdf.worker.min.mjs'))
            ? 'assets/[name]-[hash].js'
            : 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://localhost:3200' } },
});
