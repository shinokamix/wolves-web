import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { ExpressAuth } from '@auth/express';
import { UTApi } from 'uploadthing/server';
import { createAuthConfig, currentUser } from './auth.js';
import { prisma } from './prisma.js';
import { HttpError, rateLimit, route } from './http.js';
import { assertString, ValidationError } from './lib/validation.js';
import { tripsRouter } from './trips.js';
import { aiRouter } from './ai.js';

export function createApp() {
  const app = express();
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:8099/wolves-web').replace(/\/$/, '');
  const origin = new URL(frontendUrl).origin;
  const authConfig = createAuthConfig(frontendUrl);
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(cors({ origin, credentials: true }));
  app.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin !== origin) { res.status(403).json({ error: 'Origin not allowed' }); return; }
    res.setHeader('Cache-Control', 'no-store'); next();
  });
  app.get('/health', (_req, res) => { res.json({ ok: true }); });
  app.use('/api/auth/*', (req, res, next) => req.method === 'POST' ? rateLimit(req, res, next) : next(), ExpressAuth(authConfig));
  app.use(express.json({ limit: '128kb' }));
  app.use((req, res, next) => {
    if (req.is('application/json') && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) { res.status(400).json({ error: 'JSON body must be an object' }); return; }
    next();
  });
  app.post('/api/register', rateLimit, route(async (req, res) => {
    const email = assertString(req.body.email, 'email', { max: 254 }).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (password.length < 8) throw new ValidationError(['Password must be at least 8 characters']);
    if (Buffer.byteLength(password) > 72) throw new ValidationError(['Password must be at most 72 bytes']);
    const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 200) : null;
    const username = typeof req.body.username === 'string' ? req.body.username.trim() || null : null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError(['Please enter a valid email address']);
    if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) throw new ValidationError(['Username must be 3–20 letters, numbers, or underscores']);
    const exists = await prisma.user.findFirst({ where: { OR: [{ email }, ...(username ? [{ username }] : [])] } });
    if (exists) throw new HttpError(409, 'Email or username is already taken');
    await prisma.user.create({ data: { email, name, username, password: await bcrypt.hash(password, 10) } });
    res.status(201).json({ ok: true });
  }));
  app.get('/api/shared/:tripId', route(async (req, res) => {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.tripId }, select: { id: true, title: true, description: true, imageUrl: true, startDate: true, endDate: true, aiItinerary: true, aiPackingList: true, aiBudgetEstimate: true, locations: { select: { id: true, locationTitle: true, lat: true, lng: true, order: true }, orderBy: { order: 'asc' } } } });
    if (!trip) throw new HttpError(404, 'Trip not found');
    res.json(trip);
  }));
  app.use('/api', (req, res, next) => {
    void (async () => {
    const user = await currentUser(req, authConfig);
    if (!user) throw new HttpError(401, 'Please sign in');
    res.locals.user = user;
    next();
    })().catch(next);
  });
  app.use('/api', tripsRouter);
  app.use('/api/ai', aiRouter);
  app.post('/api/uploads', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], limit: '4mb' }), route(async (req, res) => {
    if (!process.env.UPLOADTHING_TOKEN) throw new HttpError(503, 'Image upload is not configured. You can paste an image URL instead.');
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'Choose a JPEG, PNG, WebP or GIF image (up to 4 MB)');
    const file = new File([new Uint8Array(req.body)], 'trip-image', { type: req.get('content-type') });
    const result = await new UTApi().uploadFiles(file);
    if (result.error || !result.data) throw new HttpError(502, 'Image upload failed');
    res.status(201).json({ url: result.data.ufsUrl });
  }));
  app.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });
  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) { res.end(); return; }
    if (error instanceof ValidationError) { res.status(400).json({ error: error.message, details: error.details }); return; }
    if (error instanceof HttpError) { res.status(error.status).json({ error: error.message }); return; }
    if (error?.code === 'P2002') { res.status(409).json({ error: 'Email or username is already taken' }); return; }
    if (error?.type === 'entity.parse.failed') { res.status(400).json({ error: 'Invalid JSON body' }); return; }
    if (error?.type === 'entity.too.large') { res.status(413).json({ error: 'Request is too large' }); return; }
    console.error(error);
    res.status(500).json({ error: 'Server error. Check the agent logs and configuration.' });
  };
  app.use(onError);
  return app;
}
