import { jsonRequest, refreshData, request } from '@/api/client';
import type { Session } from '@/api/types';
import { appPath, navigate } from '@/lib/navigation';

export function formString(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}
interface AuthResult {
  ok: boolean;
  error?: string;
}
async function authPost(action: string, values: Record<string, string>) {
  const { csrfToken } = await request<{ csrfToken: string }>('/auth/csrf');
  return request<{ url: string }>(`/auth/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Auth-Return-Redirect': '1' },
    body: new URLSearchParams({
      ...values,
      csrfToken,
      callbackUrl: `${window.location.origin}${appPath('/trips')}`,
    }),
  });
}
export async function loginWithCredentials(
  identifier: string,
  password: string,
): Promise<AuthResult> {
  try {
    const result = await authPost('callback/credentials', { identifier, password });
    if (new URL(result.url).searchParams.has('error'))
      return { ok: false, error: 'Invalid email/username or password.' };
    const session = await request<Session>('/auth/session');
    if (!session?.user?.id)
      return { ok: false, error: 'Could not start a session. Please try signing in again.' };
    window.dispatchEvent(new CustomEvent('travel:session', { detail: session }));
    refreshData();
    navigate('/trips');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Sign-in failed.' };
  }
}
export async function register(form: FormData): Promise<AuthResult> {
  try {
    await jsonRequest('/register', Object.fromEntries(form.entries()));
    return loginWithCredentials(formString(form, 'email'), formString(form, 'password'));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Registration failed.' };
  }
}
export async function loginWithProvider(provider: string) {
  try {
    const { url } = await authPost(`signin/${provider}`, {});
    window.location.assign(url);
  } catch (error) {
    window.dispatchEvent(
      new CustomEvent('travel:error', {
        detail: error instanceof Error ? error.message : 'Sign-in failed.',
      }),
    );
  }
}
export async function logout() {
  await authPost('signout', {});
  window.dispatchEvent(new CustomEvent('travel:session', { detail: null }));
  refreshData();
  navigate('/login');
}
