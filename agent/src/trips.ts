import { Router } from 'express';
import { prisma } from './prisma.js';
import { HttpError, route } from './http.js';
import { assertDateString, assertOptionalString, assertString, ValidationError } from './lib/validation.js';

export async function ownedTrip(tripId: unknown, userId: string) {
  const id = assertString(tripId, 'tripId');
  const trip = await prisma.trip.findFirst({ where: { id, userId }, include: { locations: { orderBy: { order: 'asc' } } } });
  if (!trip) throw new HttpError(404, 'Trip not found');
  return trip;
}
function tripInput(body: Record<string, unknown>) {
  const title = assertString(body.title, 'title', { max: 200 });
  const description = assertString(body.description, 'description', { max: 5000 });
  const startDate = new Date(assertDateString(body.startDate, 'startDate'));
  const endDate = new Date(assertDateString(body.endDate, 'endDate'));
  if (endDate < startDate) throw new ValidationError(['endDate must be on or after startDate']);
  const imageUrl = assertOptionalString(body.imageUrl, 'imageUrl', { max: 2048 });
  if (imageUrl) { let valid = false; try { valid = ['http:', 'https:'].includes(new URL(imageUrl).protocol); } catch { /* Invalid URL. */ } if (!valid) throw new ValidationError(['imageUrl must be an HTTP(S) URL']); }
  return { title, description, startDate, endDate, imageUrl: imageUrl || null };
}
export const tripsRouter = Router();
tripsRouter.get('/trips', route(async (_req, res) => {
  res.json(await prisma.trip.findMany({ where: { userId: res.locals.user.id }, include: { locations: { orderBy: { order: 'asc' } } }, orderBy: { startDate: 'desc' } }));
}));
tripsRouter.post('/trips', route(async (req, res) => {
  res.status(201).json(await prisma.trip.create({ data: { ...tripInput(req.body), userId: res.locals.user.id } }));
}));
tripsRouter.get('/trips/:tripId', route(async (req, res) => { res.json(await ownedTrip(req.params.tripId, res.locals.user.id)); }));
tripsRouter.patch('/trips/:tripId', route(async (req, res) => {
  const trip = await ownedTrip(req.params.tripId, res.locals.user.id);
  res.json(await prisma.trip.update({ where: { id: trip.id }, data: tripInput(req.body) }));
}));
tripsRouter.delete('/trips/:tripId', route(async (req, res) => {
  const trip = await ownedTrip(req.params.tripId, res.locals.user.id);
  await prisma.$transaction([prisma.location.deleteMany({ where: { tripId: trip.id } }), prisma.trip.delete({ where: { id: trip.id } })]);
  res.sendStatus(204);
}));
tripsRouter.post('/trips/:tripId/clone', route(async (req, res) => {
  const source = await ownedTrip(req.params.tripId, res.locals.user.id);
  const { id: _id, createdAt: _created, updatedAt: _updated, locations, ...data } = source;
  res.status(201).json(await prisma.trip.create({ data: {
    ...data, title: source.title.endsWith('(Copy)') ? source.title : `${source.title} (Copy)`,
    locations: { create: locations.map(({ locationTitle, lat, lng, order, aiTips }) => ({ locationTitle, lat, lng, order, aiTips })) },
  } }));
}));
tripsRouter.post('/trips/:tripId/locations', route(async (req, res) => {
  const trip = await ownedTrip(req.params.tripId, res.locals.user.id);
  const locationTitle = assertString(req.body.address, 'address', { max: 500 });
  let lat = req.body.lat, lng = req.body.lng;
  if (lat === undefined && lng === undefined) {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) throw new HttpError(503, 'Set GOOGLE_MAPS_API_KEY or enter coordinates manually.');
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({ address: locationTitle, key })}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new HttpError(502, 'Geocoding service unavailable');
    const data = await response.json();
    const point = data.results?.[0]?.geometry?.location;
    if (!point) throw new HttpError(400, 'Address not found. Try a more specific address or enter coordinates.');
    lat = point.lat; lng = point.lng;
  }
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new ValidationError(['Valid latitude (-90…90) and longitude (-180…180) are required']);
  res.status(201).json(await prisma.location.create({ data: { tripId: trip.id, locationTitle, lat, lng, order: trip.locations.length } }));
}));
tripsRouter.put('/trips/:tripId/locations/order', route(async (req, res) => {
  const trip = await ownedTrip(req.params.tripId, res.locals.user.id);
  const ids: unknown = req.body.locationIds;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length || ids.length !== trip.locations.length || ids.some((id) => !trip.locations.some((location) => location.id === id))) throw new ValidationError(['locationIds must contain every location of this trip exactly once']);
  await prisma.$transaction(ids.map((id: string, order: number) => prisma.location.update({ where: { id }, data: { order } })));
  res.sendStatus(204);
}));
tripsRouter.patch('/locations/:locationId', route(async (req, res) => {
  const location = await prisma.location.findFirst({ where: { id: req.params.locationId, trip: { userId: res.locals.user.id } } });
  if (!location) throw new HttpError(404, 'Location not found');
  res.json(await prisma.location.update({ where: { id: location.id }, data: { locationTitle: assertString(req.body.locationTitle, 'locationTitle', { max: 500 }) } }));
}));
tripsRouter.delete('/locations/:locationId', route(async (req, res) => {
  const location = await prisma.location.findFirst({ where: { id: req.params.locationId, trip: { userId: res.locals.user.id } } });
  if (!location) throw new HttpError(404, 'Location not found');
  await prisma.location.delete({ where: { id: location.id } });
  res.sendStatus(204);
}));
tripsRouter.get('/globe', route(async (_req, res) => {
  const locations = await prisma.location.findMany({ where: { trip: { userId: res.locals.user.id } }, include: { trip: { select: { title: true } } } });
  res.json(await Promise.all(locations.map(async (location) => {
    let country = 'Unknown';
    if (process.env.GOOGLE_MAPS_API_KEY) {
      try {
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({ latlng: `${location.lat},${location.lng}`, key: process.env.GOOGLE_MAPS_API_KEY })}`, { signal: AbortSignal.timeout(10000) });
        const data = await response.json();
        country = data.results?.[0]?.address_components?.find((part: { types: string[] }) => part.types.includes('country'))?.long_name || country;
      } catch { /* Locations still render if reverse geocoding fails. */ }
    }
    return { lat: location.lat, lng: location.lng, name: `${location.trip.title} — ${location.locationTitle}`, country };
  })));
}));
