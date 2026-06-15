/**
 * F8.5 — least-privilege error responses. The data-access layer wraps every
 * Postgres/PostgREST failure with its call-site name for the server logs, but
 * that text must never reach a user: it can carry constraint names, column
 * lists, or other schema internals.
 *
 * The exception is a business rule the database raises on purpose. A bare
 * `raise exception '...'` in our RPCs lands as SQLSTATE `P0001`
 * (`raise_exception`) with an author-written, user-safe message. Those — and
 * only those — are surfaced verbatim, as a typed `DbRuleError`. Everything
 * else stays a plain `Error` that callers fold into a generic message.
 */

/** SQLSTATE for a user-defined `raise exception` with no explicit errcode. */
const RAISE_EXCEPTION = 'P0001';

/** A deliberate, user-safe rule violation raised by one of our RPCs. */
export class DbRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DbRuleError';
  }
}

/**
 * Normalise a PostgREST/RPC error into something safe to throw. App-raised
 * rules (`P0001`) become a `DbRuleError` carrying the author's message;
 * anything else keeps the internal context for logs but stays a plain `Error`
 * that callers must not surface raw.
 */
export function rpcError(
  context: string,
  error: { message: string; code?: string | null },
): Error {
  if (error.code === RAISE_EXCEPTION) return new DbRuleError(error.message);
  return new Error(`${context}: ${error.message}`);
}
