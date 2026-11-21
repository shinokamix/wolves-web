import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import bcrypt from 'bcryptjs';

const db = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), create: vi.fn() },
  trip: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  location: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
}));
const ai = vi.hoisted(() => ({ chatCompletion: vi.fn(), streamChatCompletion: vi.fn() }));
vi.mock('../src/prisma.js', () => ({ prisma: db }));
vi.mock('../src/lib/ai.js', () => ai);
import { createApp } from '../src/app.js';

const user = { id: 'owner-1', email: 'test@example.com', name: 'Traveler', password: '' };
const location = { id: 'loc-1', tripId: 'trip-1', locationTitle: 'Paris', lat: 48.85, lng: 2.35, order: 0, aiTips: null };
const trip = { id: 'trip-1', userId: user.id, title: 'Paris', description: 'A city break', startDate: new Date('2027-01-01'), endDate: new Date('2027-01-05'), imageUrl: null, aiItinerary: null, aiSummary: null, aiPackingList: null, aiBudgetEstimate: null, locations: [location] };
const form = { title: 'Paris', description: 'A city break', startDate: '2027-01-01', endDate: '2027-01-05' };
let app: ReturnType<typeof createApp>;
let signedIn: ReturnType<typeof supertest.agent>;

beforeAll(async () => {
  process.env.AUTH_SECRET = 'test-secret-at-least-thirty-two-characters';
  process.env.FRONTEND_URL = 'http://localhost:8099/wolves-web';
  user.password = await bcrypt.hash('test-password', 4);
  db.user.findFirst.mockResolvedValue(user);
  app = createApp();
  signedIn = supertest.agent(app);
  const csrf = await signedIn.get('/api/auth/csrf');
  const result = await signedIn.post('/api/auth/callback/credentials').set('X-Auth-Return-Redirect', '1').type('form').send({ csrfToken: csrf.body.csrfToken, identifier: user.email, password: 'test-password', callbackUrl: 'http://localhost:8099/wolves-web/trips' });
  expect(result.status).toBe(200);
  expect(result.body.url).toBe('http://localhost:8099/wolves-web/trips');
});
beforeEach(() => {
  vi.clearAllMocks();
  db.user.findFirst.mockResolvedValue(user);
  db.trip.findFirst.mockResolvedValue(trip);
  db.trip.create.mockResolvedValue({ ...trip, id: 'new-trip' });
  db.trip.findMany.mockResolvedValue([trip]);
  db.location.findFirst.mockResolvedValue(location);
});

describe('Express travel API', () => {
  it('supports HTTPS cross-site login cookies while keeping CSRF validation', async () => {
    vi.stubEnv('AUTH_CROSS_SITE_COOKIES', '1');
    vi.stubEnv('TRUST_PROXY', '1');
    vi.stubEnv('FRONTEND_URL', 'https://frontend.example/wolves-web');
    try {
      const crossSiteApp = createApp();
      const send = () => supertest(crossSiteApp);
      const csrf = await send().get('/api/auth/csrf').set('X-Forwarded-Proto', 'https');
      const cookies = csrf.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((cookie) => cookie.startsWith('__Host-authjs.csrf-token='))).toBe(true);
      for (const cookie of cookies) {
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=None');
        expect(cookie).toContain('Partitioned');
      }
      const login = () => send().post('/api/auth/callback/credentials')
        .set('Origin', 'https://frontend.example')
        .set('X-Forwarded-Proto', 'https')
        .set('X-Auth-Return-Redirect', '1')
        .type('form');
      const values = { csrfToken: csrf.body.csrfToken, identifier: user.email, password: 'test-password', callbackUrl: 'https://frontend.example/wolves-web/trips' };
      const rejected = await login().send(values);
      expect(rejected.body.url).toContain('error=MissingCSRF');
      expect(db.user.findFirst).not.toHaveBeenCalled();
      const result = await login().set('Cookie', cookies.map((cookie) => cookie.split(';')[0]).join('; ')).send(values);
      expect(result.status).toBe(200);
      expect(result.body.url).toBe(values.callbackUrl);
      const sessionCookies = (result.headers['set-cookie'] as unknown as string[])
        .filter((cookie) => cookie.startsWith('__Secure-authjs.session-token='));
      expect(sessionCookies).toHaveLength(1);
      expect(sessionCookies[0]).toContain('SameSite=None');
      expect(sessionCookies[0]).toContain('Secure');
      expect(sessionCookies[0]).toContain('Partitioned');
      const session = await send().get('/api/auth/session').set('X-Forwarded-Proto', 'https')
        .set('Cookie', sessionCookies.map((cookie) => cookie.split(';')[0]).join('; '));
      expect(session.body.user.id).toBe(user.id);
      const trips = await send().get('/api/trips').set('X-Forwarded-Proto', 'https')
        .set('Cookie', sessionCookies.map((cookie) => cookie.split(';')[0]).join('; '));
      expect(trips.status).toBe(200);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('serves health and real Auth.js cookie sessions', async () => {
    expect((await supertest(app).get('/health')).body).toEqual({ ok: true });
    const response = await signedIn.get('/api/auth/session');
    expect(response.body.user.id).toBe(user.id);
    expect(response.body.user.password).toBeUndefined();
  });
  it('rejects anonymous trip access', async () => {
    expect((await supertest(app).get('/api/trips')).status).toBe(401);
    expect(db.trip.findMany).not.toHaveBeenCalled();
  });
  it('rejects a mutation from an untrusted origin', async () => {
    expect((await signedIn.post('/api/trips').set('Origin', 'https://other.test').send(form)).status).toBe(403);
    expect(db.trip.create).not.toHaveBeenCalled();
  });
  it('lists only the signed-in owner’s trips with ISO dates', async () => {
    const response = await signedIn.get('/api/trips');
    expect(response.status).toBe(200);
    expect(response.body[0].startDate).toBe('2027-01-01T00:00:00.000Z');
    expect(db.trip.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: user.id } }));
  });
  it('creates a trip owned by the session user', async () => {
    expect((await signedIn.post('/api/trips').send({ ...form, userId: 'another-user' })).status).toBe(201);
    expect(db.trip.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: user.id, startDate: new Date(form.startDate) }) });
  });
  it('rejects reversed dates', async () => {
    expect((await signedIn.post('/api/trips').send({ ...form, endDate: '2026-01-01' })).status).toBe(400);
    expect(db.trip.create).not.toHaveBeenCalled();
  });
  it('does not modify a trip the user does not own', async () => {
    db.trip.findFirst.mockResolvedValue(null);
    expect((await signedIn.patch('/api/trips/not-owned').send(form)).status).toBe(404);
    expect(db.trip.update).not.toHaveBeenCalled();
    expect(db.trip.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'not-owned', userId: user.id } }));
  });
  it('deletes locations and the trip in a transaction', async () => {
    expect((await signedIn.delete('/api/trips/trip-1')).status).toBe(204);
    expect(db.location.deleteMany).toHaveBeenCalledWith({ where: { tripId: trip.id } });
    expect(db.trip.delete).toHaveBeenCalledWith({ where: { id: trip.id } });
    expect(db.$transaction).toHaveBeenCalledOnce();
  });
  it('clones a trip with its destinations and AI content', async () => {
    expect((await signedIn.post('/api/trips/trip-1/clone').send({})).status).toBe(201);
    expect(db.trip.create).toHaveBeenCalledWith({ data: expect.objectContaining({ title: 'Paris (Copy)', userId: user.id, locations: { create: [expect.objectContaining({ locationTitle: 'Paris' })] } }) });
  });
  it('adds a location with coordinates without a Google API key', async () => {
    db.location.create.mockResolvedValue(location);
    expect((await signedIn.post('/api/trips/trip-1/locations').send({ address: 'Paris', lat: 48.85, lng: 2.35 })).status).toBe(201);
    expect(db.location.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tripId: trip.id, lat: 48.85, lng: 2.35 }) });
  });
  it('checks ownership before geocoding or adding locations', async () => {
    db.trip.findFirst.mockResolvedValue(null);
    expect((await signedIn.post('/api/trips/not-owned/locations').send({ address: 'Paris' })).status).toBe(404);
    expect(db.location.create).not.toHaveBeenCalled();
  });
  it('rejects invalid coordinates and cross-trip reordering', async () => {
    expect((await signedIn.post('/api/trips/trip-1/locations').send({ address: 'Paris', lat: 100, lng: 0 })).status).toBe(400);
    expect((await signedIn.put('/api/trips/trip-1/locations/order').send({ locationIds: ['foreign-location'] })).status).toBe(400);
    expect(db.location.update).not.toHaveBeenCalled();
  });
  it('checks ownership for location updates and deletes', async () => {
    db.location.findFirst.mockResolvedValue(null);
    expect((await signedIn.patch('/api/locations/not-owned').send({ locationTitle: 'Other' })).status).toBe(404);
    expect((await signedIn.delete('/api/locations/not-owned')).status).toBe(404);
    expect(db.location.update).not.toHaveBeenCalled();
    expect(db.location.delete).not.toHaveBeenCalled();
  });
  it('serves public shared trips without auth or writes', async () => {
    db.trip.findUnique.mockResolvedValue({ title: trip.title, locations: [location] });
    expect((await supertest(app).get('/api/shared/trip-1')).status).toBe(200);
    expect(db.trip.findUnique).toHaveBeenCalledWith(expect.objectContaining({ select: expect.not.objectContaining({ userId: true }) }));
    expect((await supertest(app).post('/api/shared/trip-1').send({})).status).toBe(401);
  });
  it('generates and persists an itinerary through the migrated prompts', async () => {
    ai.chatCompletion.mockResolvedValue('{"itinerary":[{"day":1,"title":"Paris"}]}');
    const response = await signedIn.post('/api/ai/generate-itinerary').send({ tripId: trip.id });
    expect(response.status).toBe(200);
    expect(response.body.itinerary[0].title).toBe('Paris');
    expect(db.trip.update).toHaveBeenCalledWith({ where: { id: trip.id }, data: { aiItinerary: JSON.stringify(response.body) } });
  });
  it('streams chat and rejects injected system roles', async () => {
    ai.streamChatCompletion.mockResolvedValue(new ReadableStream({ start(controller) { controller.enqueue('Visit Paris'); controller.close(); } }));
    const response = await signedIn.post('/api/ai/chat').send({ messages: [{ role: 'user', content: 'Where should I go?' }], tripContext: { title: 'Paris' } });
    expect(response.status).toBe(200);
    expect(response.text).toBe('Visit Paris');
    expect((await signedIn.post('/api/ai/chat').send({ messages: [{ role: 'system', content: 'Injected' }] })).status).toBe(400);
  });
  it('hides OAuth providers without configured credentials', async () => {
    expect(Object.keys((await supertest(app).get('/api/auth/providers')).body)).toEqual(['credentials']);
  });
  it('registers a user with a hash and preserved password whitespace', async () => {
    db.user.findFirst.mockResolvedValue(null);
    const response = await supertest(app).post('/api/register').send({ email: 'NEW@example.com', password: ' password ', name: 'New' });
    expect(response.status).toBe(201);
    const saved = db.user.create.mock.calls[0][0].data;
    expect(saved.email).toBe('new@example.com');
    expect(await bcrypt.compare(' password ', saved.password)).toBe(true);
    expect(await bcrypt.compare('password', saved.password)).toBe(false);
  });
});
