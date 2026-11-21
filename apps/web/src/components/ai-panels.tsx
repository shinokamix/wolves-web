import { jsonRequest } from '@/api/client';
import { useAsyncAction } from '@/lib/use-async-action';
import React from 'react';

import { CalendarDays, Lightbulb, ListChecks, MapPin, Sparkles, Wand2 } from 'lucide-react';
import { useState } from 'react';
import type { Location, Trip } from '@/api/types';
import { Button } from '@/components/ui/button';

type TripWithLocations = Trip & { locations: Location[] };

type ItineraryData = {
  itinerary?: Array<{
    day?: number;
    date?: string;
    title?: string;
    activities?: Array<{
      time?: string;
      description?: string;
      location?: string;
      category?: string;
      needs?: string;
      tips?: string;
    }>;
  }>;
  highlights?: string[];
  estimatedBudget?: unknown;
};

type SummaryData = {
  summary?: string;
  tips?: string[];
  packingSuggestions?: string[];
  budgetEstimate?: unknown;
};

type LocationTipsData = {
  tips?: string[];
  mustTry?: string[];
  avoid?: string[];
  bestTimeToVisit?: string;
  estimatedCost?: string;
};

function SectionCard({
  title,
  icon,
  children,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  empty?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
        {icon}
        {title}
      </h3>
      {empty ? <p className="text-sm text-indigo-700">{empty}</p> : children}
    </div>
  );
}

function readStored<T>(value: string | null): T | null {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export default function AiPanels({ trip }: { trip: TripWithLocations }) {
  const [itinerary, setItinerary] = useState<ItineraryData | null>(() =>
    readStored<ItineraryData>(trip.aiItinerary),
  );
  const [summary, setSummary] = useState<SummaryData | null>(() =>
    trip.aiSummary
      ? {
          summary: trip.aiSummary,
          packingSuggestions: readStored<string[]>(trip.aiPackingList) || [],
          budgetEstimate: readStored<unknown>(trip.aiBudgetEstimate),
        }
      : null,
  );
  const [tips, setTips] = useState<Record<string, LocationTipsData>>(() => {
    const result: Record<string, LocationTipsData> = {};
    for (const location of trip.locations) {
      const storedTips = readStored<LocationTipsData>(location.aiTips);
      if (storedTips) result[location.id] = storedTips;
    }
    return result;
  });
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const [busy, startBusy] = useAsyncAction();
  const [error, setError] = useState<string | null>(null);

  const runAi = (fn: () => Promise<void>) =>
    startBusy(async () => {
      setError(null);
      try {
        await fn();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'The AI service is temporarily unavailable. Please try again later.',
        );
      }
    });

  const generateItinerary = () =>
    runAi(async () => {
      setItinerary(await jsonRequest<ItineraryData>('/ai/generate-itinerary', { tripId: trip.id }));
    });
  const generateSummary = () =>
    runAi(async () => {
      setSummary(await jsonRequest<SummaryData>('/ai/summarize', { tripId: trip.id }));
    });
  const fetchTips = (locationId: string) =>
    runAi(async () => {
      const data = await jsonRequest<LocationTipsData>('/ai/location-tips', { locationId });
      setTips((previous) => ({ ...previous, [locationId]: data }));
    });
  const suggestLocations = () =>
    runAi(async () => {
      const data = await jsonRequest<Array<{ name?: string }>>('/ai/suggest-locations', {
        tripId: trip.id,
      });
      setSuggestions(data.map((item) => item.name || '').filter(Boolean));
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Button onClick={generateItinerary} disabled={busy}>
          <Wand2 className="mr-2 h-4 w-4" /> Generate Itinerary
        </Button>
        <Button variant="secondary" onClick={generateSummary} disabled={busy}>
          <Sparkles className="mr-2 h-4 w-4" /> AI Summary & Packing
        </Button>
        <Button variant="outline" onClick={suggestLocations} disabled={busy}>
          <MapPin className="mr-2 h-4 w-4" /> Suggest Locations
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error.includes('429') || error.toLowerCase().includes('rate')
            ? 'The AI rate limit has been reached. Please try again later or add OpenRouter credits.'
            : error}
        </div>
      )}

      {suggestions.length > 0 && (
        <SectionCard title="Suggested Locations" icon={<MapPin className="h-5 w-5 text-sky-600" />}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            {suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard
        title="AI Itinerary"
        icon={<CalendarDays className="h-5 w-5 text-sky-600" />}
        empty={itinerary ? undefined : 'Click “Generate Itinerary” to create a day-by-day plan.'}
      >
        {itinerary?.itinerary?.map((day, i) => (
          <div key={i} className="mb-4">
            <h4 className="font-semibold text-gray-800 dark:text-gray-100">
              Day {day.day ?? i + 1}
              {day.title ? ` — ${day.title}` : ''}
            </h4>
            <ul className="ml-4 list-disc text-sm text-indigo-800 dark:text-gray-300">
              {(day.activities ?? []).map((a, j) => (
                <li key={j}>
                  {a.time ? `${a.time} — ` : ''}
                  {a.description ?? ''}
                  {a.location ? ` (${a.location})` : ''}
                  {a.category ? (
                    <span className="ml-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                      {a.category}
                    </span>
                  ) : null}
                  {a.tips ? ` — ${a.tips}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {itinerary?.highlights && itinerary.highlights.length > 0 && (
          <div className="mt-2">
            <p className="text-sm font-medium text-gray-700">Highlights</p>
            <ul className="ml-4 list-disc text-sm text-gray-700">
              {itinerary.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="AI Summary & Packing"
        icon={<ListChecks className="h-5 w-5 text-sky-600" />}
        empty={summary ? undefined : 'Click “AI Summary & Packing” to generate insights.'}
      >
        {summary?.summary && (
          <p className="mb-3 whitespace-pre-line text-sm text-gray-700">{summary.summary}</p>
        )}
        {summary?.tips && summary.tips.length > 0 && (
          <div className="mb-3">
            <p className="text-sm font-medium text-gray-700">Tips</p>
            <ul className="ml-4 list-disc text-sm text-gray-700">
              {summary.tips.map((t: string, i: number) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}
        {summary?.packingSuggestions && summary.packingSuggestions.length > 0 && (
          <div className="mb-3">
            <p className="text-sm font-medium text-gray-700">Packing</p>
            <ul className="ml-4 list-disc text-sm text-gray-700">
              {summary.packingSuggestions.map((p: string, i: number) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        {summary?.budgetEstimate != null && (
          <p className="text-sm text-gray-700">
            <span className="font-medium">Budget: </span>
            {typeof summary.budgetEstimate === 'string'
              ? (summary.budgetEstimate as string)
              : JSON.stringify(summary.budgetEstimate)}
          </p>
        )}
      </SectionCard>

      {trip.locations.length > 0 && (
        <SectionCard
          title="Per-Location Tips"
          icon={<Lightbulb className="h-5 w-5 text-sky-600" />}
        >
          <div className="space-y-4">
            {trip.locations.map((loc) => {
              const tip = tips[loc.id];
              return (
                <div key={loc.id} className="rounded-md border border-gray-100 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium text-gray-800">{loc.locationTitle}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => fetchTips(loc.id)}
                    >
                      {tip ? 'Regenerate' : 'Get tips'}
                    </Button>
                  </div>
                  {!tip && (
                    <p className="text-sm text-indigo-700">
                      Generate insider tips for this destination.
                    </p>
                  )}
                  {tip && (
                    <div className="space-y-1 text-sm text-gray-700">
                      {tip.tips?.map((t, i) => (
                        <p key={i}>• {t}</p>
                      ))}
                      {tip.mustTry?.length ? (
                        <p>
                          <span className="font-medium">Must try: </span>
                          {tip.mustTry.join(', ')}
                        </p>
                      ) : null}
                      {tip.avoid?.length ? (
                        <p>
                          <span className="font-medium">Avoid: </span>
                          {tip.avoid.join(', ')}
                        </p>
                      ) : null}
                      {tip.bestTimeToVisit && (
                        <p>
                          <span className="font-medium">Best time: </span>
                          {tip.bestTimeToVisit}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
