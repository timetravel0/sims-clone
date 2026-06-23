import { defineConfig } from 'vite';
import { writeFileSync } from 'fs';
import { resolve }       from 'path';

const configPath = resolve('config/gameConfig.json');

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
  },
  plugins: [{
    name: 'admin-save',
    configureServer(server) {
      server.middlewares.use('/admin/save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
          try {
            JSON.parse(body);
            writeFileSync(configPath, body, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message }));
          }
        });
      });
    },
  }],
});
