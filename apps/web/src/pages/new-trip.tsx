import { useAsyncAction } from '@/lib/use-async-action';
import React from 'react';

import Image from '@/components/image';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { createTrip } from '@/api/trips';
import { UploadButton } from '@/components/image-upload';
import { cn } from '@/lib/utils';

export default function NewTrip() {
  const [isPending, startTransition] = useAsyncAction();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  return (
    <div className="max-w-lg mx-auto mt-10">
      <Card>
        <CardHeader> New Trip</CardHeader>
        <CardContent>
          <form
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              if (imageUrl) {
                formData.append('imageUrl', imageUrl);
              }
              startTransition(async () => {
                await createTrip(formData);
              });
            }}
          >
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                {' '}
                Title
              </label>
              <input
                id="title"
                type="text"
                name="title"
                placeholder="Japan trip..."
                className={cn(
                  'w-full border border-gray-300 px-3 py-2.5 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-100',
                )}
                required
              />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                placeholder="Trip description..."
                className={cn(
                  'w-full border border-gray-300 px-3 py-2.5 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-100',
                )}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  id="startDate"
                  type="date"
                  required
                  name="startDate"
                  className={cn(
                    'w-full border border-gray-300 px-3 py-2',
                    'rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-100',
                  )}
                />
              </div>
              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                  {' '}
                  End Date
                </label>
                <input
                  id="endDate"
                  type="date"
                  required
                  name="endDate"
                  className={cn(
                    'w-full border border-gray-300 px-3 py-2',
                    'rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-100',
                  )}
                />
              </div>
            </div>
            <div>
              <label htmlFor="tripImage"> Trip Image</label>
              <input
                id="tripImage"
                type="url"
                placeholder="https://… (image URL)"
                value={imageUrl || ''}
                onChange={(event) => setImageUrl(event.target.value)}
                className="mb-3 w-full rounded-xl border border-gray-300 px-3 py-2"
              />

              {imageUrl && (
                <Image
                  src={imageUrl}
                  alt="Trip Preview"
                  className="w-full mb-4 rounded-md max-h-48 object-cover"
                  width={300}
                  height={100}
                />
              )}
              <UploadButton
                endpoint="imageUploader"
                onClientUploadComplete={(res) => {
                  if (res?.[0].ufsUrl) {
                    setImageUrl(res[0].ufsUrl);
                  }
                }}
                onUploadError={(error: Error) => {
                  console.error('Upload error: ', error);
                }}
              />
            </div>
            <Button
              type="submit"
              disabled={isPending}
              className="btn-gradient w-full rounded-xl py-2.5 text-base font-semibold shadow-lg shadow-indigo-500/30 hover:brightness-110"
            >
              {isPending ? 'Creating...' : 'Create Trip'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
