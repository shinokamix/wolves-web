import { Router } from 'express';
import { prisma } from './prisma.js';
import { HttpError, rateLimit, route } from './http.js';
import { ownedTrip } from './trips.js';
import { chatCompletion, streamChatCompletion, type ChatMessage } from './lib/ai.js';
import { PROMPTS } from './lib/ai-prompts.js';
import { extractJson } from './lib/json.js';
import { assertString, ValidationError } from './lib/validation.js';

export const aiRouter = Router();
aiRouter.use(rateLimit);
aiRouter.post('/chat', route(async (req, res) => {
  const { messages, tripContext } = req.body;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) throw new ValidationError(['messages must contain 1–50 messages']);
  const history: ChatMessage[] = messages.map((message) => {
    if (!message || !['user', 'assistant'].includes(message.role)) throw new ValidationError(['Invalid message role']);
    return { role: message.role, content: assertString(message.content, 'content', { max: 10000 }) };
  });
  const context = tripContext ? JSON.stringify(tripContext) : '';
  if (context.length > 10000) throw new ValidationError(['Trip context is too long']);
  const stream = await streamChatCompletion([{ role: 'system', content: `${PROMPTS.chatSystem}\nCurrent trip context: ${context}` }, ...history]);
  const reader = stream.getReader();
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const onClose = () => { void reader.cancel(); };
  res.on('close', onClose);
  try {
    while (!res.destroyed) { const { done, value } = await reader.read(); if (done) break; res.write(value); }
    res.end();
  } finally { res.off('close', onClose); reader.releaseLock(); }
}));
aiRouter.post('/:action', route(async (req, res) => {
  const action = req.params.action;
  if (!['generate-itinerary', 'summarize', 'suggest-locations', 'location-tips'].includes(action)) throw new HttpError(404, 'Unknown AI action');
  if (action === 'location-tips') {
    const id = assertString(req.body.locationId, 'locationId');
    const location = await prisma.location.findFirst({ where: { id, trip: { userId: res.locals.user.id } }, include: { trip: true } });
    if (!location) throw new HttpError(404, 'Location not found');
    const output = extractJson(await chatCompletion([{ role: 'system', content: 'You are a local travel guide. Always respond with valid JSON only.' }, { role: 'user', content: PROMPTS.locationTips(location.locationTitle, location.trip.title) }], { maxTokens: 1536 }));
    await prisma.location.update({ where: { id }, data: { aiTips: JSON.stringify(output) } });
    res.json(output); return;
  }
  const trip = await ownedTrip(req.body.tripId, res.locals.user.id);
  const start = trip.startDate.toISOString().split('T')[0], end = trip.endDate.toISOString().split('T')[0];
  const names = trip.locations.map((location) => location.locationTitle).join(', ');
  const prompt = action === 'generate-itinerary'
    ? PROMPTS.generateItinerary(trip.title, trip.description, start, end, trip.locations.map((location) => ({ name: location.locationTitle, lat: location.lat, lng: location.lng })))
    : action === 'summarize' ? PROMPTS.generateSummary(trip.title, trip.description, start, end, names)
    : PROMPTS.suggestLocations(trip.title, trip.description, start, end, names);
  const output = extractJson(await chatCompletion([{ role: 'system', content: 'You are an expert travel planner. Always respond with valid JSON only.' }, { role: 'user', content: prompt }], { maxTokens: action === 'generate-itinerary' ? 4096 : 3072 }));
  if (action === 'generate-itinerary') await prisma.trip.update({ where: { id: trip.id }, data: { aiItinerary: JSON.stringify(output) } });
  if (action === 'summarize') {
    if (!output || typeof output !== 'object' || Array.isArray(output)) throw new HttpError(502, 'Invalid summary response from AI');
    const data = output as { summary?: string; packingSuggestions?: string[]; budgetEstimate?: unknown };
    await prisma.trip.update({ where: { id: trip.id }, data: { aiSummary: typeof data.summary === 'string' ? data.summary : '', aiPackingList: JSON.stringify(data.packingSuggestions || []), aiBudgetEstimate: JSON.stringify(data.budgetEstimate || {}) } });
  }
  res.json(output);
}));
