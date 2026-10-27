import { env } from './env';

/**
 * @typedef {object} RequestOptions
 * @property {'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'} [method] default GET
 * @property {unknown} [body] sent as JSON
 * @property {FormData} [formData] multipart upload (e.g. an image); sent instead of a JSON body
 * @property {AbortSignal} [signal]
 * @property {string} [idempotencyKey] makes a retried POST safe (checkout, top-ups, redemptions)
 */

/**
 * Transport used by api(): the real fetch client, or the demo-mode mock (Phase 7).
 * @typedef {(path: string, options: RequestOptions) => Promise<any>} Transport
 */

/**
 * Error thrown for any non-2xx API response. `fields` carries per-field validation messages
 * (keys match the API's snake_case field names).
 */
export class ApiError extends Error {
  /** @type {number} HTTP status (0 when offline) */
  status;
  /** @type {string} machine-readable code, e.g. 'validation_failed', 'csrf_mismatch' */
  code;
  /** @type {Record<string, string>} field → message */
  fields;
  /** @type {number | undefined} seconds to wait after a 429 */
  retryAfter;
  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message safe to show to the user
   * @param {Record<string, string>} [fields]
   * @param {number} [retryAfter]
   */
  constructor(status, code, message, fields = {}, retryAfter) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.retryAfter = retryAfter;
    this.name = 'ApiError';
  }
}

// The CSRF token lives only in memory: never localStorage. Auth itself is an httpOnly cookie.
let csrfToken = null;

export function setCsrfToken(token) {
  csrfToken = token;
}

async function fetchCsrfToken() {
  const res = await fetch(`${env.apiBase}/auth/csrf`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok)
    throw new ApiError(res.status, 'csrf_unavailable', 'We couldn’t reach the server. Please try again.');
  const data = await res.json();
  csrfToken = data.csrfToken;
  return csrfToken;
}

async function request(path, options, retried) {
  const method = options.method ?? 'GET';
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') {
    headers['X-CSRF-Token'] = csrfToken ?? (await fetchCsrfToken());
    // The browser sets the multipart boundary itself for FormData.
    if (!options.formData) headers['Content-Type'] = 'application/json';
  }
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let res;
  try {
    res = await fetch(`${env.apiBase}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: method === 'GET' ? undefined : (options.formData ?? JSON.stringify(options.body ?? {})),
      signal: options.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network_error', 'You appear to be offline. Check your connection and try again.');
  }

  const data = await res.json().catch(() => ({}));
  if (typeof data.csrfToken === 'string') csrfToken = data.csrfToken;

  if (!res.ok) {
    const err = data.error ?? {};
    // A stale token (e.g. session expired in another tab): refresh it once and replay.
    if (res.status === 403 && err.code === 'csrf_mismatch' && !retried) {
      await fetchCsrfToken();
      return request(path, options, true);
    }
    throw new ApiError(
      res.status,
      err.code ?? 'error',
      err.message ?? 'Something went wrong. Please try again.',
      err.fields,
      err.retryAfter,
    );
  }
  return data;
}

const httpTransport = (path, options) => request(path, options, false);
let transport = httpTransport;

/**
 * Swap the transport (demo mode installs the mock API here at startup).
 * @param {Transport} t
 */
export function setTransport(t) {
  transport = t;
}

/**
 * Calls the API. Resolves with the JSON body; rejects with ApiError for any non-2xx answer.
 * POST/PUT/PATCH/DELETE carry the CSRF token, and a stale token is refreshed once and retried.
 * @param {string} path e.g. '/menu' (relative to VITE_API_BASE)
 * @param {RequestOptions} [options]
 * @returns {Promise<any>}
 */
export function api(path, options = {}) {
  const result = transport(path, options);
  // Development only (never in production builds or tests): check important responses against
  // the shapes in apiSchemas.js and log a clear error if one doesn't match.
  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    void result.then(
      (data) => import('./apiSchemas').then((m) => m.checkResponse(options.method ?? 'GET', path, data)),
      () => {},
    );
  }
  return result;
}
