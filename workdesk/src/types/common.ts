// ─────────────────────────────────────────────────────────────────────────────
// Paginated list envelope
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared API Response Envelope
//
// Every route handler in WorkDesk returns this structure.
// Consumers check `success` first, then read `data` or `error`.
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiResponse<T = undefined> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper constructors — keeps route handlers DRY.
// ─────────────────────────────────────────────────────────────────────────────

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function fail(
  code: string,
  message: string,
  details?: unknown
): ApiResponse<never> {
  return { success: false, error: { code, message, details } };
}
