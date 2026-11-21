import React, { useState } from 'react';
import { request } from '@/api/client';

export function UploadButton({
  onClientUploadComplete,
  onUploadError,
}: {
  endpoint: string;
  onClientUploadComplete: (files: { ufsUrl: string }[]) => void;
  onUploadError: (error: Error) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="space-y-2">
      <input
        aria-label="Upload trip image"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        disabled={pending}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (file.size > 4 * 1024 * 1024) {
            setError('Choose an image smaller than 4 MB');
            return;
          }
          setPending(true);
          setError('');
          try {
            const result = await request<{ url: string }>('/uploads', {
              method: 'POST',
              headers: { 'Content-Type': file.type },
              body: file,
            });
            onClientUploadComplete([{ ufsUrl: result.url }]);
          } catch (cause) {
            const uploadError = cause instanceof Error ? cause : new Error('Upload failed');
            setError(uploadError.message);
            onUploadError(uploadError);
          } finally {
            setPending(false);
          }
        }}
      />
      {pending && <output>Uploading…</output>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
