import { useEffect, useRef, type MutableRefObject } from 'react';

/**
 * Keep a ref aligned with the latest value via an effect (render stays pure).
 * Prefer this over `ref.current = value` during render.
 */
export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
