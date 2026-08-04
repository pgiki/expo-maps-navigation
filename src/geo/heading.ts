/**
 * Treat negative / non-finite headings as unknown (expo-location uses -1).
 */
export function resolveHeading(
  raw: number | null | undefined,
  fallback: number
): number {
  if (raw == null || !Number.isFinite(raw) || raw < 0) return fallback;
  return raw;
}
