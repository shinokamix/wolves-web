import { Auth, type AuthConfig } from '@auth/core';
import bcrypt from 'bcryptjs';
import { Hono } from 'hono';
import { createFactory } from 'hono/factory';
import { prisma } from '../../db.js';
import { HttpError, limitBody, rateLimit, type ApiEnv } from '../../http.js';
import { assertString, ValidationError } from '../../lib/validation.js';
import { authRequest } from './config.js';

export function createAuthRoutes(config: AuthConfig) {
  const routes = new Hono<ApiEnv>();
  routes.use('*', (context, next) => context.req.method === 'POST' ? rateLimit(context, next) : next());
  routes.use('*', limitBody(100 * 1024));
  routes.all('*', (context) => Auth(authRequest(context.req.raw), config));
  return routes;
}

export const register = createFactory<ApiEnv>().createHandlers(rateLimit, async (context) => {
  const body = context.get('body');
  const email = assertString(body.email, 'email', { max: 254 }).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8) throw new ValidationError(['Password must be at least 8 characters']);
  if (Buffer.byteLength(password) > 72) throw new ValidationError(['Password must be at most 72 bytes']);
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : null;
  const username = typeof body.username === 'string' ? body.username.trim() || null : null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError(['Please enter a valid email address']);
  if (username && !/^[a-zA-Z0-9_]{3,20}$/.test(username)) throw new ValidationError(['Username must be 3–20 letters, numbers, or underscores']);
  const exists = await prisma.user.findFirst({ where: { OR: [{ email }, ...(username ? [{ username }] : [])] } });
  if (exists) throw new HttpError(409, 'Email or username is already taken');
  await prisma.user.create({ data: { email, name, username, password: await bcrypt.hash(password, 10) } });
  return context.json({ ok: true }, 201);
});
