import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { checkRateLimit } from './lib/rate-limit.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function route(handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next: NextFunction) => { void handler(req, res).catch(next); };
}
export const rateLimit: RequestHandler = (req, res, next) => {
  const key = res.locals.user?.id || req.ip || 'unknown';
  const result = checkRateLimit(new Request('http://agent', { headers: { 'x-forwarded-for': key } }));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  if (!result.allowed) {
    res.setHeader('Retry-After', String(Math.ceil((result.retryAfterMs || 60000) / 1000)));
    res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    return;
  }
  next();
};
