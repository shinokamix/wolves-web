import { useRef, useState } from 'react';

// React 18 useTransition does not track async work.
export function useAsyncAction(): [boolean, (action: () => void | Promise<unknown>) => void] {
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  return [
    pending,
    (action) => {
      if (running.current) return;
      running.current = true;
      setPending(true);
      Promise.resolve()
        .then(action)
        .catch((error: unknown) => {
          window.dispatchEvent(
            new CustomEvent('travel:error', {
              detail: error instanceof Error ? error.message : 'Request failed',
            }),
          );
        })
        .finally(() => {
          running.current = false;
          setPending(false);
        });
    },
  ];
}
