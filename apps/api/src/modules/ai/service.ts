import { prisma } from '../../db.js';
import { HttpError } from '../../http.js';
import { assertString } from '../../lib/validation.js';
import { ownedTrip } from '../trips/service.js';
import { generateLocationTips, generateTripContent } from './agent/operations.js';

export async function runAiAction(action: string, body: Record<string, unknown>, userId: string) {
  if (action === 'location-tips') {
    const id = assertString(body.locationId, 'locationId');
    const location = await prisma.location.findFirst({ where: { id, trip: { userId } }, include: { trip: true } });
    if (!location) throw new HttpError(404, 'Location not found');
    const output = await generateLocationTips(location.locationTitle, location.trip.title);
    await prisma.location.update({ where: { id }, data: { aiTips: JSON.stringify(output) } });
    return output;
  }

  if (action !== 'generate-itinerary' && action !== 'summarize' && action !== 'suggest-locations') throw new HttpError(404, 'Unknown AI action');
  const trip = await ownedTrip(body.tripId, userId);
  const output = await generateTripContent(action, trip);
  if (action === 'generate-itinerary') {
    await prisma.trip.update({ where: { id: trip.id }, data: { aiItinerary: JSON.stringify(output) } });
  }
  if (action === 'summarize') {
    if (!output || typeof output !== 'object' || Array.isArray(output)) throw new HttpError(502, 'Invalid summary response from AI');
    const data = output as { summary?: string; packingSuggestions?: string[]; budgetEstimate?: unknown };
    await prisma.trip.update({ where: { id: trip.id }, data: {
      aiSummary: typeof data.summary === 'string' ? data.summary : '',
      aiPackingList: JSON.stringify(data.packingSuggestions || []),
      aiBudgetEstimate: JSON.stringify(data.budgetEstimate || {}),
    } });
  }
  return output;
}
