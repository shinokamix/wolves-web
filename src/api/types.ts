// HTTP data uses ISO date strings; Prisma stays on the server.
export interface Trip {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  startDate: string;
  endDate: string;
  userId: string;
  aiItinerary: string | null;
  aiSummary: string | null;
  aiPackingList: string | null;
  aiBudgetEstimate: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Location {
  id: string;
  tripId: string;
  locationTitle: string;
  lat: number;
  lng: number;
  order: number;
  aiTips: string | null;
  createdAt: string;
}
export interface TripWithLocations extends Trip {
  locations: Location[];
}
export interface Session {
  user: { id: string; name?: string | null; email?: string | null; image?: string | null };
  expires: string;
}
