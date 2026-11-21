import React from 'react';
import { GripVertical } from 'lucide-react';
import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useId, useState } from 'react';
import type { Location } from '@/api/types';
import EditLocation from '@/components/edit-location';
import { reorderItinerary } from '@/api/trips';
import DeleteLocationButton from './delete-location-button';

interface SortableItineraryProps {
  locations: Location[];
  tripId: string;
}

function SortableItem({ item }: { item: Location }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="p-4 border rounded-md flex justify-between items-center hover:shadow transition-shadow"
    >
      <button
        type="button"
        aria-label="Reorder location"
        {...attributes}
        {...listeners}
        className="mr-3 cursor-grab touch-none text-gray-400"
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <h4 className="font-medium text-gray-800">{item.locationTitle}</h4>
        <div className="mt-1">
          <EditLocation locationId={item.id} title={item.locationTitle} />
        </div>
        <p className="text-sm text-gray-500 truncate max-w-xs">
          {' '}
          {`Latitude: ${item.lat}, Longitude: ${item.lng}`}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-sm text-gray-600"> Day {item.order + 1}</div>
        <DeleteLocationButton locationId={item.id} />
      </div>
    </div>
  );
}

export default function SortableItinerary({ locations, tripId }: SortableItineraryProps) {
  const id = useId();
  const [localLocation, setLocalLocation] = useState(locations);

  const [previousLocations, setPreviousLocations] = useState(locations);
  if (locations !== previousLocations) {
    setPreviousLocations(locations);
    setLocalLocation(locations);
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = localLocation.findIndex((item) => item.id === active.id);
      const newIndex = localLocation.findIndex((item) => item.id === over?.id);

      const newLocationsOrder = arrayMove(localLocation, oldIndex, newIndex).map((item, index) => ({
        ...item,
        order: index,
      }));

      setLocalLocation(newLocationsOrder);

      try {
        await reorderItinerary(
          tripId,
          newLocationsOrder.map((item) => item.id),
        );
      } catch (error) {
        setLocalLocation(locations);
        window.dispatchEvent(
          new CustomEvent('travel:error', {
            detail: error instanceof Error ? error.message : 'Could not reorder locations',
          }),
        );
      }
    }
  };

  return (
    <DndContext id={id} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext
        items={localLocation.map((loc) => loc.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-4">
          {localLocation.map((item) => (
            <SortableItem key={item.id} item={item} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
