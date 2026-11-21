import { assertString, ValidationError } from '../../../lib/validation.js';
import { chatCompletion, streamChatCompletion, type ChatMessage } from './client.js';
import { extractJson } from './json.js';
import { PROMPTS } from './prompts.js';

export function streamTripChat(messages: unknown, tripContext: unknown) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) throw new ValidationError(['messages must contain 1–50 messages']);
  const history: ChatMessage[] = messages.map((message) => {
    if (!message || !['user', 'assistant'].includes(message.role)) throw new ValidationError(['Invalid message role']);
    return { role: message.role, content: assertString(message.content, 'content', { max: 10000 }) };
  });
  const context = tripContext ? JSON.stringify(tripContext) : '';
  if (context.length > 10000) throw new ValidationError(['Trip context is too long']);
  return streamChatCompletion([{ role: 'system', content: `${PROMPTS.chatSystem}\nCurrent trip context: ${context}` }, ...history]);
}

export async function generateLocationTips(locationTitle: string, tripTitle: string) {
  return extractJson(await chatCompletion([
    { role: 'system', content: 'You are a local travel guide. Always respond with valid JSON only.' },
    { role: 'user', content: PROMPTS.locationTips(locationTitle, tripTitle) },
  ], { maxTokens: 1536 }));
}

type TripInput = {
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  locations: { locationTitle: string; lat: number; lng: number }[];
};

export async function generateTripContent(action: 'generate-itinerary' | 'summarize' | 'suggest-locations', trip: TripInput) {
  const start = trip.startDate.toISOString().split('T')[0];
  const end = trip.endDate.toISOString().split('T')[0];
  const names = trip.locations.map((location) => location.locationTitle).join(', ');
  const prompt = action === 'generate-itinerary'
    ? PROMPTS.generateItinerary(trip.title, trip.description, start, end, trip.locations.map((location) => ({ name: location.locationTitle, lat: location.lat, lng: location.lng })))
    : action === 'summarize' ? PROMPTS.generateSummary(trip.title, trip.description, start, end, names)
    : PROMPTS.suggestLocations(trip.title, trip.description, start, end, names);
  return extractJson(await chatCompletion([
    { role: 'system', content: 'You are an expert travel planner. Always respond with valid JSON only.' },
    { role: 'user', content: prompt },
  ], { maxTokens: action === 'generate-itinerary' ? 4096 : 3072 }));
}
