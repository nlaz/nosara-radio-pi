import { useCallback, useEffect, useRef, useState } from 'react';
import { api, isApiError, toMessage } from '../api';
import type { AppStatus } from '../types';

const POLL_MS = 1000;

export interface UseStatusResult {
  status: AppStatus | null;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useStatus(): UseStatusResult {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visibleRef = useRef<boolean>(typeof document === 'undefined' ? true : document.visibilityState === 'visible');
  const cancelledRef = useRef(false);

  // refresh() exposed to callers: stable identity, respects unmount.
  const refresh = useCallback(async () => {
    try {
      const s = await api.getStatus();
      if (cancelledRef.current) return;
      setStatus(s);
      setError(null);
    } catch (err) {
      if (cancelledRef.current) return;
      setError(toMessage(err));
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    let cancelled = false;
    let authLost = false;
    let timer: number | null = null;

    // Inner closure that closes over `cancelled` so the loop can't be
    // tricked into setting state on an unmounted hook.
    const fetchOnce = async () => {
      try {
        const s = await api.getStatus();
        if (cancelled) return;
        setStatus(s);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (isApiError(err) && err.status === 401) {
          // api.ts has already triggered window.location.href to /login.
          // Stop polling so the page navigates cleanly.
          authLost = true;
          return;
        }
        setError(toMessage(err));
      }
    };

    const tick = async () => {
      if (cancelled || authLost) return;
      if (visibleRef.current) await fetchOnce();
      if (cancelled || authLost) return;
      timer = window.setTimeout(tick, POLL_MS);
    };

    const onVisibility = () => {
      visibleRef.current = document.visibilityState === 'visible';
      if (visibleRef.current && !cancelled && !authLost) void fetchOnce();
    };

    document.addEventListener('visibilitychange', onVisibility);
    void tick();

    return () => {
      cancelled = true;
      cancelledRef.current = true;
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { status, error, refresh };
}
