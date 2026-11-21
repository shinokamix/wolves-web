import { getNavigationValue } from '@brojs/cli';
import { useNavigate } from 'react-router-dom';
import { refreshData } from '@/api/client';

export function appBase() {
  return (getNavigationValue('wolves-web.main') || '/wolves-web').replace(/\/$/, '');
}
export function appPath(path: string) {
  return `${appBase()}${path}`;
}
export function navigate(path: string) {
  window.dispatchEvent(new CustomEvent('travel:navigate', { detail: path }));
}
export function useRouter() {
  const push = useNavigate();
  return { push, refresh: refreshData };
}
