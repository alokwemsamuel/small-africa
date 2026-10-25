import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { vi } from 'vitest';
import { setCsrfToken } from '@/lib/api';

/** Renders routes at `path` with a fresh query client. */
export function renderRoutes(routes: RouteObject[], path = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router, client };
}

type Handler = (url: string, init: RequestInit) => { status?: number; body: unknown };

/** Replaces global fetch with a router of JSON handlers keyed by "METHOD /path". */
export function mockApi(handlers: Record<string, Handler>) {
  setCsrfToken(null);
  const calls: { method: string; path: string; body: unknown; headers: Record<string, string> }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = url.replace(/^.*\/api/, '');
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push({
      method,
      path,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    const csrf: Handler = () => ({ body: { csrfToken: 'test-token' } });
    const handler = handlers[`${method} ${path}`] ?? (path === '/auth/csrf' ? csrf : undefined);
    if (!handler)
      return new Response(JSON.stringify({ error: { code: 'not_found', message: 'nf' } }), { status: 404 });
    const { status = 200, body } = handler(url, init);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}
