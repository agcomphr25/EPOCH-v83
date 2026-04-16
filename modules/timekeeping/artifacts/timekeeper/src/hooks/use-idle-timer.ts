import { useEffect, useRef, useState, useCallback } from "react";

interface UseIdleTimerOptions {
  timeoutSeconds: number;
  onTimeout: () => void;
  paused?: boolean;
}

export function useIdleTimer({ timeoutSeconds, onTimeout, paused = false }: UseIdleTimerOptions) {
  const [remainingSeconds, setRemainingSeconds] = useState(timeoutSeconds);
  const remainingMsRef = useRef(timeoutSeconds * 1000);
  const lastTickRef = useRef(Date.now());
  const onTimeoutRef = useRef(onTimeout);
  const wasPausedRef = useRef(paused);
  onTimeoutRef.current = onTimeout;

  const reset = useCallback(() => {
    remainingMsRef.current = timeoutSeconds * 1000;
    lastTickRef.current = Date.now();
    setRemainingSeconds(timeoutSeconds);
  }, [timeoutSeconds]);

  useEffect(() => {
    reset();
  }, [timeoutSeconds, reset]);

  useEffect(() => {
    if (wasPausedRef.current && !paused) {
      lastTickRef.current = Date.now();
    }
    wasPausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (paused) return;

    lastTickRef.current = Date.now();

    const tick = () => {
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;
      remainingMsRef.current = Math.max(0, remainingMsRef.current - elapsed);

      const leftSec = Math.ceil(remainingMsRef.current / 1000);
      setRemainingSeconds(leftSec);

      if (remainingMsRef.current <= 0) {
        onTimeoutRef.current();
      }
    };

    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [paused]);

  useEffect(() => {
    if (paused) return;

    const handler = () => reset();
    const events: Array<keyof WindowEventMap> = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"];
    events.forEach((evt) => window.addEventListener(evt, handler, { passive: true }));
    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handler));
    };
  }, [paused, reset]);

  return { remainingSeconds, reset };
}
