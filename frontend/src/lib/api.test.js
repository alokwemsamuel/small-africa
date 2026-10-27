import { api, ApiError, setCsrfToken } from './api';

/** A fake fetch that answers each call in turn and records what was sent. */
function fakeFetch(...answers) {
  const calls = [];
  const fn = vi.fn(async (url, init = {}) => {
    calls.push({ url, ...init, headers: init.headers ?? {} });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => {
        if (next.body === undefined) throw new SyntaxError('Unexpected token <'); // an HTML error page
        return next.body;
      },
    };
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}
const ok = (body) => ({ status: 200, body });

beforeEach(() => setCsrfToken(null));
afterEach(() => vi.unstubAllGlobals());

describe('API client', () => {
  it('GETs JSON with cookies and no CSRF header', async () => {
    const calls = fakeFetch(ok({ dishes: [] }));
    await expect(api('/menu')).resolves.toEqual({ dishes: [] });
    expect(calls[0].url).toBe('/api/menu');
    expect(calls[0].credentials).toBe('include');
    expect(calls[0].headers['X-CSRF-Token']).toBeUndefined();
  });

  it('fetches a CSRF token before the first POST and sends JSON with an idempotency key', async () => {
    const calls = fakeFetch(ok({ csrfToken: 't1' }), ok({ ok: true }));
    await api('/orders', { method: 'POST', body: { a: 1 }, idempotencyKey: 'key-1234567890abcdef' });
    expect(calls[0].url).toBe('/api/auth/csrf');
    expect(calls[1].headers).toMatchObject({
      'X-CSRF-Token': 't1',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'key-1234567890abcdef',
    });
    expect(calls[1].body).toBe('{"a":1}');
  });

  it('keeps a token sent with a response (e.g. after sign-in) for the next request', async () => {
    const calls = fakeFetch(ok({ csrfToken: 'fresh' }), ok({}));
    setCsrfToken('old');
    await api('/auth/login', { method: 'POST', body: {} }); // answers with a new token
    await api('/auth/logout', { method: 'POST' });
    expect(calls[0].headers['X-CSRF-Token']).toBe('old');
    expect(calls[1].headers['X-CSRF-Token']).toBe('fresh');
  });

  it('refreshes a stale CSRF token once and replays the request', async () => {
    const mismatch = { status: 403, body: { error: { code: 'csrf_mismatch', message: 'Stale' } } };
    const calls = fakeFetch(mismatch, ok({ csrfToken: 't2' }), ok({ done: true }));
    setCsrfToken('stale');
    await expect(api('/contact', { method: 'POST', body: {} })).resolves.toEqual({ done: true });
    expect(calls.map((c) => c.url)).toEqual(['/api/contact', '/api/auth/csrf', '/api/contact']);
    expect(calls[2].headers['X-CSRF-Token']).toBe('t2');
  });

  it('gives up after one retry', async () => {
    const mismatch = { status: 403, body: { error: { code: 'csrf_mismatch', message: 'Stale' } } };
    fakeFetch(mismatch, ok({ csrfToken: 't2' }), mismatch);
    setCsrfToken('stale');
    await expect(api('/contact', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 403 });
  });

  it('turns error responses into ApiError with field messages', async () => {
    fakeFetch({
      status: 422,
      body: {
        error: {
          code: 'validation_failed',
          message: 'Check the fields.',
          fields: { email: 'Enter a valid email address.' },
        },
      },
    });
    const err = await api('/menu').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 422,
      code: 'validation_failed',
      fields: { email: 'Enter a valid email address.' },
    });
  });

  it('reports rate limits with the wait time', async () => {
    fakeFetch({ status: 429, body: { error: { code: 'rate_limited', message: 'Wait', retryAfter: 30 } } });
    await expect(api('/menu')).rejects.toMatchObject({ status: 429, retryAfter: 30 });
  });

  it('uses a friendly message when the server answers with a non-JSON error page', async () => {
    fakeFetch({ status: 500, body: undefined });
    await expect(api('/menu')).rejects.toMatchObject({
      status: 500,
      message: 'Something went wrong. Please try again.',
    });
  });

  it('says so when the visitor is offline, but lets aborts through', async () => {
    fakeFetch(new TypeError('Failed to fetch'));
    await expect(api('/menu')).rejects.toMatchObject({ status: 0, code: 'network_error' });
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    fakeFetch(abort);
    await expect(api('/menu')).rejects.toBe(abort);
  });

  it('lets the browser set the multipart header for uploads', async () => {
    const calls = fakeFetch(ok({}));
    setCsrfToken('t');
    const form = new FormData();
    form.append('alt', 'Jollof');
    await api('/admin/dishes/1/image', { method: 'POST', formData: form });
    expect(calls[0].headers['Content-Type']).toBeUndefined();
    expect(calls[0].body).toBe(form);
  });
});
