import { PrismaAdapter } from '@auth/prisma-adapter';
import { getSession, type ExpressAuthConfig } from '@auth/express';
import Credentials from '@auth/express/providers/credentials';
import Google from '@auth/express/providers/google';
import Facebook from '@auth/express/providers/facebook';
import Apple from '@auth/express/providers/apple';
import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { prisma } from './prisma.js';

export function createAuthConfig(frontendUrl: string): ExpressAuthConfig {
  const providers: ExpressAuthConfig['providers'] = [Credentials({
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
  return {
    adapter: PrismaAdapter(prisma), providers, secret: process.env.AUTH_SECRET,
    trustHost: true, basePath: '/api/auth', session: { strategy: 'jwt' },
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
}
export async function currentUser(req: Request, config: ExpressAuthConfig) {
  const session = await getSession(req, config);
  return session?.user?.id ? session.user : null;
}
