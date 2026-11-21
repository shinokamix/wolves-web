import type { Session } from '@auth/core/types';
import type { HttpBindings } from '@hono/node-server';
import type { ErrorHandler, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { checkRateLimit } from './lib/rate-limit.js';
import { ValidationError } from './lib/validation.js';

export type User = NonNullable<Session['user']> & { id: string };
export type ApiEnv = {
  Bindings: HttpBindings;
  Variables: { user: User; body: Record<string, unknown> };
};

export class HttpError extends Error {
  constructor(public status: ContentfulStatusCode, message: string) { super(message); }
}

export function limitBody(maxSize: number): MiddlewareHandler<ApiEnv> {
  return bodyLimit({ maxSize, onError: (context) => context.json({ error: 'Request is too large' }, 413) });
}

export function mediaType(contentType?: string): string | undefined {
  return contentType?.split(';', 1)[0]?.trim().toLowerCase();
}

const limitJson = limitBody(128 * 1024);

export const jsonBody: MiddlewareHandler<ApiEnv> = (context, next) => {
  context.set('body', {});
  if (mediaType(context.req.header('Content-Type')) !== 'application/json' || !context.req.raw.body) return next();
  return limitJson(context, async () => {
    const text = await context.req.text();
    if (text) {
      let body: unknown;
      try { body = JSON.parse(text); } catch { throw new HttpError(400, 'Invalid JSON body'); }
      if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid JSON body');
      if (Array.isArray(body)) throw new HttpError(400, 'JSON body must be an object');
      context.set('body', body as Record<string, unknown>);
    }
    await next();
  });
};

export const rateLimit: MiddlewareHandler<ApiEnv> = async (context, next) => {
  const forwarded = process.env.TRUST_PROXY === '1' && context.req.header('X-Forwarded-For')?.split(',').at(-1)?.trim();
  const key = context.get('user')?.id || forwarded || context.env?.incoming?.socket.remoteAddress || 'unknown';
  const result = checkRateLimit(key);
  context.header('X-RateLimit-Remaining', String(result.remaining));
  if (!result.allowed) {
    context.header('Retry-After', String(Math.ceil((result.retryAfterMs || 60000) / 1000)));
    return context.json({ error: 'Too many requests. Please try again shortly.' }, 429);
  }
  await next();
};

export const onError: ErrorHandler<ApiEnv> = (error, context) => {
  if (error instanceof ValidationError) return context.json({ error: error.message, details: error.details }, 400);
  if (error instanceof HttpError) return context.json({ error: error.message }, error.status);
  if ('code' in error && error.code === 'P2002') return context.json({ error: 'Email or username is already taken' }, 409);
  console.error(error);
  return context.json({ error: 'Server error. Check the agent logs and configuration.' }, 500);
};
