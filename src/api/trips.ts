import { jsonRequest, refreshData } from '@/api/client';
import type { Trip } from '@/api/types';
import { navigate } from '@/lib/navigation';

const fields = (form: FormData) => Object.fromEntries(form.entries());
export async function createTrip(form: FormData) {
  const trip = await jsonRequest<Trip>('/trips', fields(form));
  refreshData();
  navigate(`/trips/${trip.id}`);
}
export async function updateTrip(form: FormData, tripId: string) {
  await jsonRequest(`/trips/${tripId}`, fields(form), 'PATCH');
  refreshData();
}
export async function cloneTrip(tripId: string) {
  const trip = await jsonRequest<Trip>(`/trips/${tripId}/clone`, {});
  refreshData();
  navigate(`/trips/${trip.id}`);
}
export async function addLocation(form: FormData, tripId: string) {
  const data: Record<string, unknown> = fields(form);
  if (form.get('lat') && form.get('lng')) {
    data.lat = Number(form.get('lat'));
    data.lng = Number(form.get('lng'));
  }
  if (!form.get('lat')) delete data.lat;
  if (!form.get('lng')) delete data.lng;
  await jsonRequest(`/trips/${tripId}/locations`, data);
  refreshData();
  navigate(`/trips/${tripId}`);
}
export async function updateLocationTitle(locationId: string, locationTitle: string) {
  await jsonRequest(`/locations/${locationId}`, { locationTitle }, 'PATCH');
  refreshData();
}
export async function reorderItinerary(tripId: string, locationIds: string[]) {
  await jsonRequest(`/trips/${tripId}/locations/order`, { locationIds }, 'PUT');
  refreshData();
}
