import { prisma } from '../../db.js';
import { HttpError } from '../../http.js';
import { assertString } from '../../lib/validation.js';

export async function ownedTrip(tripId: unknown, userId: string) {
  const id = assertString(tripId, 'tripId');
  const trip = await prisma.trip.findFirst({
    where: { id, userId },
    include: { locations: { orderBy: { order: 'asc' } } },
  });
  if (!trip) throw new HttpError(404, 'Trip not found');
  return trip;
}
