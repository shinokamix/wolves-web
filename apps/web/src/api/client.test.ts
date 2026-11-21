import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, apiUrl, jsonRequest, request } from './client';
const config = vi.hoisted(() => ({ url: 'https://travel.test' }));
vi.mock('@brojs/cli', () => ({ getConfigValue: () => config.url }));
beforeEach(() => {
  config.url = 'https://travel.test';
});
afterEach(() => {
  vi.unstubAllGlobals();
});
describe('API client', () => {
  it('uses the configured backend without duplicating /api', () => {
    config.url = 'https://travel.test/';
    expect(apiUrl('/api/trips')).toBe('https://travel.test/api/trips');
    expect(apiUrl('/trips')).toBe('https://travel.test/api/trips');
  });
  it('includes cookies for a separately hosted agent', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetch);
    await apiFetch('/trips');
    expect(fetch).toHaveBeenCalledWith('https://travel.test/api/trips', { credentials: 'include' });
  });
  it('surfaces validation details to forms', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: 'Validation failed',
            details: ['endDate must be on or after startDate'],
          }),
          { status: 400 },
        ),
      ),
    );
    await expect(request('/trips')).rejects.toThrow('endDate must be on or after startDate');
  });
  it('handles a successful delete with an empty body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(request('/locations/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });
  it('sends JSON dates as strings', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"id":"trip-1"}'));
    vi.stubGlobal('fetch', fetch);
    await jsonRequest('/trips', { startDate: '2027-01-01', endDate: '2027-01-05' });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      startDate: '2027-01-01',
      endDate: '2027-01-05',
    });
  });
});
