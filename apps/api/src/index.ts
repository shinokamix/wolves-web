import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { prisma } from './db.js';

for (const name of ['DATABASE_URL', 'AUTH_SECRET']) {
  if (!process.env[name]) throw new Error(`Set ${name} in apps/api/.env (see .env.example)`);
}

const port = Number(process.env.PORT || 8787);
const server = serve({ fetch: createApp().fetch, port }, () => {
  console.log(`Travel API: http://localhost:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => {
    void prisma.$disconnect().then(() => process.exit(0));
  }));
}
