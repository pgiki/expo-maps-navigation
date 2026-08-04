/**
 * Typed OSRM / routing failures so hosts can distinguish network vs router vs empty.
 */
export class OsrmError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly cause?: unknown;

  constructor(
    message: string,
    options?: { status?: number; code?: string; cause?: unknown }
  ) {
    super(message);
    this.name = 'OsrmError';
    this.status = options?.status;
    this.code = options?.code;
    this.cause = options?.cause;
  }
}

export function isOsrmError(error: unknown): error is OsrmError {
  return error instanceof OsrmError;
}

export function formatOsrmError(error: unknown): string {
  if (error instanceof OsrmError) {
    const parts = [error.message];
    if (error.code) parts.push(`code=${error.code}`);
    if (error.status != null) parts.push(`status=${error.status}`);
    return parts.join(' ');
  }
  if (error instanceof Error) return error.message;
  return 'Route request failed.';
}
