import { useEffect, useRef } from "react";

export function useInterval(callback: () => void, delayMs: number, enabled: boolean = true): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => callbackRef.current(), delayMs);
    return () => window.clearInterval(id);
  }, [delayMs, enabled]);
}
