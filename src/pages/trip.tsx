import React from 'react';
import { useParams } from 'react-router-dom';
import { useResource } from '@/api/client';
import type { TripWithLocations } from '@/api/types';
import TripDetail from '@/components/trip-detail';
import { PageState } from '@/components/page-state';

export default function TripPage() {
  const { tripId } = useParams();
  const { data, loading, error, reload } = useResource<TripWithLocations>(`/trips/${tripId}`);
  if (loading || error || !data)
    return <PageState loading={loading} error={error} retry={reload} />;
  return <TripDetail key={data.id} trip={data} />;
}
