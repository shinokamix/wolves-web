import { PrismaAdapter } from '@auth/prisma-adapter';
import { Auth, setEnvDefaults, type AuthConfig } from '@auth/core';
import Credentials from '@auth/core/providers/credentials';
import Google from '@auth/core/providers/google';
import Facebook from '@auth/core/providers/facebook';
import Apple from '@auth/core/providers/apple';
import type { Session } from '@auth/core/types';
import bcrypt from 'bcryptjs';
import { prisma } from '../../db.js';
import type { User } from '../../http.js';

export function createAuthConfig(frontendUrl: string): AuthConfig {
  const crossSiteCookies = process.env.AUTH_CROSS_SITE_COOKIES === '1';
  const cookieOptions = { httpOnly: true, secure: true, sameSite: 'none' as const, partitioned: true, path: '/' };
  const providers: AuthConfig['providers'] = [Credentials({
    credentials: { identifier: {}, password: {} },
    async authorize(credentials) {
      if (typeof credentials.identifier !== 'string' || typeof credentials.password !== 'string' || Buffer.byteLength(credentials.password) > 72) return null;
      const identifier = credentials.identifier.trim();
      const user = await prisma.user.findFirst({ where: { OR: [{ email: identifier.toLowerCase() }, { username: identifier }] } });
      if (!user?.password || !await bcrypt.compare(credentials.password, user.password)) return null;
      return { id: user.id, name: user.name, email: user.email, image: user.image };
    },
  })];
  if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) providers.push(Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET }));
  if (process.env.AUTH_FACEBOOK_ID && process.env.AUTH_FACEBOOK_SECRET) providers.push(Facebook({ clientId: process.env.AUTH_FACEBOOK_ID, clientSecret: process.env.AUTH_FACEBOOK_SECRET }));
  if (process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET) providers.push(Apple({ clientId: process.env.AUTH_APPLE_ID, clientSecret: process.env.AUTH_APPLE_SECRET }));
  const config: AuthConfig = {
    adapter: PrismaAdapter(prisma), providers, secret: process.env.AUTH_SECRET,
    trustHost: true, basePath: '/api/auth', session: { strategy: 'jwt' },
    ...(crossSiteCookies ? {
      useSecureCookies: true,
      cookies: {
        csrfToken: { name: '__Host-authjs.csrf-token', options: cookieOptions },
        sessionToken: { name: '__Secure-authjs.session-token', options: cookieOptions },
        callbackUrl: { name: '__Secure-authjs.callback-url', options: cookieOptions },
      },
    } : {}),
    pages: { signIn: `${frontendUrl}/login`, error: `${frontendUrl}/login` },
    callbacks: {
      jwt({ token, user }) { if (user) token.id = user.id; return token; },
      session({ session, token }) { if (token.id) session.user.id = String(token.id); return session; },
      redirect({ url }) {
        const target = new URL(url, frontendUrl);
        return target.origin === new URL(frontendUrl).origin ? target.href : `${frontendUrl}/trips`;
      },
    },
  };
  setEnvDefaults(process.env, config);
  return config;
}

function authOrigin(request: Request): string {
  const configuredUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (configuredUrl) return new URL(configuredUrl).origin;

  const url = new URL(request.url);
  if (process.env.TRUST_PROXY === '1') {
    const protocol = request.headers.get('X-Forwarded-Proto')?.split(',')[0]?.trim();
    if (protocol === 'http' || protocol === 'https') url.protocol = protocol;
  }
  return url.origin;
}

export function authRequest(request: Request): Request {
  const url = new URL(request.url);
  const origin = authOrigin(request);
  return origin === url.origin ? request : new Request(new URL(url.pathname + url.search, origin), request);
}

export async function currentUser(request: Request, config: AuthConfig): Promise<User | null> {
  const sessionUrl = new URL(`${config.basePath}/session`, authOrigin(request));
  const response = await Auth(new Request(sessionUrl, { headers: { cookie: request.headers.get('cookie') ?? '' } }), config);
  const session = await response.json() as Session | { message?: string } | null;
  if (!session || !Object.keys(session).length) return null;
  if (response.status !== 200) throw new Error('message' in session ? session.message : undefined);
  const user = 'user' in session ? session.user : undefined;
  return user?.id ? { ...user, id: user.id } : null;
}
