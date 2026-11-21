import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HttpError, jsonBody, onError, type ApiEnv } from './http.js';
import { aiRoutes } from './modules/ai/routes.js';
import { createAuthConfig, currentUser } from './modules/auth/config.js';
import { createAuthRoutes, register } from './modules/auth/routes.js';
import { sharedTrip, tripsRoutes } from './modules/trips/routes.js';
import { uploadsRoutes } from './modules/uploads/routes.js';

export function createApp() {
  const app = new Hono<ApiEnv>({ strict: false });
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:8099/wolves-web').replace(/\/$/, '');
  const origin = new URL(frontendUrl).origin;
  const authConfig = createAuthConfig(frontendUrl);

  app.use(cors({ origin: () => origin, credentials: true, allowMethods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'] }));
  app.use(async (context, next) => {
    const requestOrigin = context.req.header('Origin');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(context.req.method) && requestOrigin && requestOrigin !== origin) {
      return context.json({ error: 'Origin not allowed' }, 403);
    }
    context.header('Cache-Control', 'no-store');
    await next();
  });

  app.get('/health', (context) => context.json({ ok: true }));
  app.route('/api/auth', createAuthRoutes(authConfig));
  app.use(jsonBody);
  app.post('/api/register', ...register);
  app.get('/api/shared/:tripId', sharedTrip);

  app.use('/api/*', async (context, next) => {
    const user = await currentUser(context.req.raw, authConfig);
    if (!user) throw new HttpError(401, 'Please sign in');
    context.set('user', user);
    await next();
  });
  app.route('/api', tripsRoutes);
  app.route('/api/ai', aiRoutes);
  app.route('/api/uploads', uploadsRoutes);

  app.notFound((context) => context.json({ error: 'Not found' }, 404));
  app.onError(onError);
  return app;
}
