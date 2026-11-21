import { apiFetch } from '@/api/client';
import { useAsyncAction } from '@/lib/use-async-action';
import React from 'react';

import { Trash2 } from 'lucide-react';
import { useRouter } from '@/lib/navigation';

interface DeleteLocationButtonProps {
  locationId: string;
}

export default function DeleteLocationButton({ locationId }: DeleteLocationButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useAsyncAction();

  const handleDelete = () => {
    if (!confirm('Remove this location from the trip?')) return;
    startTransition(async () => {
      const res = await apiFetch(`/locations/${locationId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        router.refresh();
      } else {
        alert('Failed to delete location.');
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      aria-label="Delete location"
      className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
