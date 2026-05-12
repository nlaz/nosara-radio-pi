import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
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

  const fetchOnce = async () => {
    try {
      const s = await api.getStatus();
      setStatus(s);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      if (cancelled) return;
      if (visibleRef.current) await fetchOnce();
      if (cancelled) return;
      timer = window.setTimeout(tick, POLL_MS);
    };

    const onVisibility = () => {
      visibleRef.current = document.visibilityState === 'visible';
      if (visibleRef.current) fetchOnce();
    };

    document.addEventListener('visibilitychange', onVisibility);
    tick();

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { status, error, refresh: fetchOnce };
}
