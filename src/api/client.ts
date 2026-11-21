import { getConfigValue } from '@brojs/cli';
import { useCallback, useEffect, useState } from 'react';

export function apiUrl(path: string) {
  const base = (getConfigValue('wolves-web.agent') || 'http://localhost:8787').replace(/\/$/, '');
  return `${base}/api${path.replace(/^\/api(?=\/|$)/, '')}`;
}
export function apiFetch(path: string, options: RequestInit = {}) {
  return fetch(apiUrl(path), { credentials: 'include', ...options });
}
export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    const text = await response.text();
    let message = text || `Request failed (${response.status})`;
    try {
      const data = JSON.parse(text);
      message = data.details?.join(', ') || data.error || message;
    } catch {
      /* Plain-text response. */
    }
    throw new Error(message);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export function jsonRequest<T>(path: string, body: unknown, method = 'POST') {
  return request<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
export function refreshData() {
  window.dispatchEvent(new Event('travel:refresh'));
}
export function useResource<T>(path: string) {
  const [state, setState] = useState<{
    path: string;
    data: T | null;
    loading: boolean;
    error: string | null;
  }>({ path, data: null, loading: true, error: null });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    window.addEventListener('travel:refresh', reload);
    return () => window.removeEventListener('travel:refresh', reload);
  }, [reload]);
  useEffect(() => {
    const controller = new AbortController();
    void revision;
    request<T>(path, { signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) setState({ path, data, loading: false, error: null });
      },
      (error: Error) => {
        if (!controller.signal.aborted)
          setState({ path, data: null, loading: false, error: error.message });
      },
    );
    return () => controller.abort();
  }, [path, revision]);
  const update = useCallback(
    (data: T) => setState({ path, data, loading: false, error: null }),
    [path],
  );
  return state.path === path
    ? { ...state, reload, update }
    : { data: null, loading: true, error: null, reload, update };
}
