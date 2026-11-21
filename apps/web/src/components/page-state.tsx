import React from 'react';

export function PageState({
  loading,
  error,
  retry,
}: {
  loading?: boolean;
  error?: string | null;
  retry?: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <output>{loading ? 'Loading…' : error || 'Nothing found.'}</output>
      {!loading && retry && (
        <button
          type="button"
          className="rounded-xl bg-sky-600 px-4 py-2 text-white"
          onClick={retry}
        >
          Try again
        </button>
      )}
    </div>
  );
}
