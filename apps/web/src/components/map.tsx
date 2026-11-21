import React from 'react';

import { getConfigValue } from '@brojs/cli';
import { GoogleMap, Marker, useLoadScript } from '@react-google-maps/api';
import type { Location } from '@/api/types';

interface MapViewProps {
  itineraries: Location[];
}

function LoadedMap({ itineraries, apiKey }: MapViewProps & { apiKey: string }) {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey,
  });

  if (loadError) {
    return (
      <div className="h-full w-full grid place-items-center text-sm text-red-500">
        Error loading maps
      </div>
    );
  }
  if (!isLoaded) {
    return (
      <div className="h-full w-full grid place-items-center text-sm text-gray-400">
        Loading maps…
      </div>
    );
  }

  const center =
    itineraries.length > 0
      ? { lat: itineraries[0].lat, lng: itineraries[0].lng }
      : { lat: 20, lng: 0 };

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '100%' }}
      zoom={itineraries.length > 1 ? 4 : 8}
      center={center}
    >
      {itineraries.map((location, key) => (
        <Marker
          key={key}
          position={{ lat: location.lat, lng: location.lng }}
          title={location.locationTitle}
        />
      ))}
    </GoogleMap>
  );
}

export default function TripMap(props: MapViewProps) {
  const apiKey = getConfigValue('wolves-web.google-maps-key');
  if (!apiKey)
    return (
      <div className="grid h-full place-items-center p-4 text-center text-sm text-gray-500">
        Map requires a Google Maps API key.
      </div>
    );
  return <LoadedMap {...props} apiKey={apiKey} />;
}
