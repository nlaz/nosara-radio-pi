import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_WINDOW_MS = 3000;

/**
 * Two-tap confirmation. First call sets pending=true for `windowMs`;
 * a second call within the window fires the action.
 */
export function useConfirmTap(action: () => void | Promise<void>, windowMs = DEFAULT_WINDOW_MS) {
  const [pending, setPending] = useState(false);
  const timerRef = useRef<number | null>(null);
  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  const fire = useCallback(() => {
    if (pending) {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setPending(false);
      void actionRef.current();
      return;
    }
    setPending(true);
    timerRef.current = window.setTimeout(() => setPending(false), windowMs);
  }, [pending, windowMs]);

  return { pending, fire };
}
