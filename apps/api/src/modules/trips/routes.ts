import { Hono, type Handler } from 'hono';
import { prisma } from '../../db.js';
import { HttpError, type ApiEnv } from '../../http.js';
import { assertDateString, assertOptionalString, assertString, ValidationError } from '../../lib/validation.js';
import { ownedTrip } from './service.js';

function tripInput(body: Record<string, unknown>) {
  const title = assertString(body.title, 'title', { max: 200 });
  const description = assertString(body.description, 'description', { max: 5000 });
  const startDate = new Date(assertDateString(body.startDate, 'startDate'));
  const endDate = new Date(assertDateString(body.endDate, 'endDate'));
  if (endDate < startDate) throw new ValidationError(['endDate must be on or after startDate']);
  const imageUrl = assertOptionalString(body.imageUrl, 'imageUrl', { max: 2048 });
  if (imageUrl) {
    const url = URL.parse(imageUrl);
    if (!url || !['http:', 'https:'].includes(url.protocol)) throw new ValidationError(['imageUrl must be an HTTP(S) URL']);
  }
  return { title, description, startDate, endDate, imageUrl: imageUrl || null };
}

export const sharedTrip: Handler<ApiEnv, '/api/shared/:tripId'> = async (context) => {
  const trip = await prisma.trip.findUnique({
    where: { id: context.req.param('tripId') },
    select: {
      id: true, title: true, description: true, imageUrl: true, startDate: true, endDate: true,
      aiItinerary: true, aiPackingList: true, aiBudgetEstimate: true,
      locations: { select: { id: true, locationTitle: true, lat: true, lng: true, order: true }, orderBy: { order: 'asc' } },
    },
  });
  if (!trip) throw new HttpError(404, 'Trip not found');
  return context.json(trip);
};

export const tripsRoutes = new Hono<ApiEnv>();

tripsRoutes.get('/trips', async (context) => {
  const trips = await prisma.trip.findMany({
    where: { userId: context.get('user').id },
    include: { locations: { orderBy: { order: 'asc' } } },
    orderBy: { startDate: 'desc' },
  });
  return context.json(trips);
});

tripsRoutes.post('/trips', async (context) => {
  const trip = await prisma.trip.create({ data: { ...tripInput(context.get('body')), userId: context.get('user').id } });
  return context.json(trip, 201);
});

tripsRoutes.get('/trips/:tripId', async (context) => {
  return context.json(await ownedTrip(context.req.param('tripId'), context.get('user').id));
});

tripsRoutes.patch('/trips/:tripId', async (context) => {
  const trip = await ownedTrip(context.req.param('tripId'), context.get('user').id);
  return context.json(await prisma.trip.update({ where: { id: trip.id }, data: tripInput(context.get('body')) }));
});

tripsRoutes.delete('/trips/:tripId', async (context) => {
  const trip = await ownedTrip(context.req.param('tripId'), context.get('user').id);
  await prisma.$transaction([
    prisma.location.deleteMany({ where: { tripId: trip.id } }),
    prisma.trip.delete({ where: { id: trip.id } }),
  ]);
  return context.body(null, 204);
});

tripsRoutes.post('/trips/:tripId/clone', async (context) => {
  const source = await ownedTrip(context.req.param('tripId'), context.get('user').id);
  const { id: _id, createdAt: _created, updatedAt: _updated, locations, ...data } = source;
  const trip = await prisma.trip.create({ data: {
    ...data, title: source.title.endsWith('(Copy)') ? source.title : `${source.title} (Copy)`,
    locations: { create: locations.map(({ locationTitle, lat, lng, order, aiTips }) => ({ locationTitle, lat, lng, order, aiTips })) },
  } });
  return context.json(trip, 201);
});

tripsRoutes.post('/trips/:tripId/locations', async (context) => {
  const trip = await ownedTrip(context.req.param('tripId'), context.get('user').id);
  const body = context.get('body');
  const locationTitle = assertString(body.address, 'address', { max: 500 });
  let { lat, lng } = body;
  if (lat === undefined && lng === undefined) {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) throw new HttpError(503, 'Set GOOGLE_MAPS_API_KEY or enter coordinates manually.');
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({ address: locationTitle, key })}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new HttpError(502, 'Geocoding service unavailable');
    const data = await response.json();
    const point = data.results?.[0]?.geometry?.location;
    if (!point) throw new HttpError(400, 'Address not found. Try a more specific address or enter coordinates.');
    lat = point.lat;
    lng = point.lng;
  }
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new ValidationError(['Valid latitude (-90…90) and longitude (-180…180) are required']);
  }
  const location = await prisma.location.create({ data: { tripId: trip.id, locationTitle, lat, lng, order: trip.locations.length } });
  return context.json(location, 201);
});

tripsRoutes.put('/trips/:tripId/locations/order', async (context) => {
  const trip = await ownedTrip(context.req.param('tripId'), context.get('user').id);
  const ids = context.get('body').locationIds;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length || ids.length !== trip.locations.length || ids.some((id) => !trip.locations.some((location) => location.id === id))) {
    throw new ValidationError(['locationIds must contain every location of this trip exactly once']);
  }
  await prisma.$transaction(ids.map((id: string, order) => prisma.location.update({ where: { id }, data: { order } })));
  return context.body(null, 204);
});

tripsRoutes.patch('/locations/:locationId', async (context) => {
  const id = context.req.param('locationId');
  const location = await prisma.location.findFirst({ where: { id, trip: { userId: context.get('user').id } } });
  if (!location) throw new HttpError(404, 'Location not found');
  const locationTitle = assertString(context.get('body').locationTitle, 'locationTitle', { max: 500 });
  return context.json(await prisma.location.update({ where: { id: location.id }, data: { locationTitle } }));
});

tripsRoutes.delete('/locations/:locationId', async (context) => {
  const id = context.req.param('locationId');
  const location = await prisma.location.findFirst({ where: { id, trip: { userId: context.get('user').id } } });
  if (!location) throw new HttpError(404, 'Location not found');
  await prisma.location.delete({ where: { id: location.id } });
  return context.body(null, 204);
});

tripsRoutes.get('/globe', async (context) => {
  const locations = await prisma.location.findMany({ where: { trip: { userId: context.get('user').id } }, include: { trip: { select: { title: true } } } });
  return context.json(await Promise.all(locations.map(async (location) => {
    let country = 'Unknown';
    if (process.env.GOOGLE_MAPS_API_KEY) {
      try {
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({ latlng: `${location.lat},${location.lng}`, key: process.env.GOOGLE_MAPS_API_KEY })}`, { signal: AbortSignal.timeout(10000) });
        const data = await response.json();
        country = data.results?.[0]?.address_components?.find((part: { types: string[] }) => part.types.includes('country'))?.long_name || country;
      } catch {}
    }
    return { lat: location.lat, lng: location.lng, name: `${location.trip.title} — ${location.locationTitle}`, country };
  })));
});
