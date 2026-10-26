import type { Permission } from '@/features/admin/api';
import { ApiError, type RequestOptions } from '@/lib/api';
import type { Row } from './db';
import { fail } from './http';
import { can, currentUser, STAFF_ROLES } from './services/auth';

export interface Ctx {
  params: Record<string, string>;
  query: URLSearchParams;
  body: Row;
  form: FormData | undefined;
  user: Row | null;
  idempotencyKey: string | null;
}

/** A signed-in user is guaranteed for 'user', 'staff' and permission routes. */
export type AuthedCtx = Ctx & { user: Row };

type Guard = 'user' | 'staff' | Permission;
type Handler = (ctx: AuthedCtx) => unknown;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  guard: Guard | null;
  handler: Handler;
}

const routes: Route[] = [];

/** Registers a route. Path parameters: `:id` is numeric, any other `:name` is one path segment. */
export function route(method: string, path: string, handler: Handler, guard: Guard | null = null): void {
  const keys: string[] = [];
  const pattern = new RegExp(
    `^${path.replace(/:(\w+)/g, (_, key: string) => {
      keys.push(key);
      return key === 'id' ? '([0-9]+)' : '([^/]+)';
    })}$`,
  );
  routes.push({ method, pattern, keys, guard, handler });
}

/** Handles one API call against the demo database, like the PHP app would. */
export async function dispatch(path: string, options: RequestOptions): Promise<unknown> {
  const method = options.method ?? 'GET';
  const [pathname = '', search = ''] = path.split('?');
  let pathMatched = false;
  for (const r of routes) {
    const m = r.pattern.exec(pathname);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== method) continue;
    const user = currentUser();
    if (r.guard) {
      if (!user) throw fail.unauthorized();
      if (r.guard !== 'user' && !STAFF_ROLES.includes(user.role)) throw fail.forbidden();
      if (r.guard !== 'user' && r.guard !== 'staff' && !can(user, r.guard)) throw fail.forbidden();
    }
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
    return r.handler({
      params,
      query: new URLSearchParams(search),
      body: (options.body ?? {}) as Row,
      form: options.formData,
      user: user as Row,
      idempotencyKey: options.idempotencyKey ?? null,
    });
  }
  throw pathMatched
    ? new ApiError(405, 'http_error', 'That isn’t allowed.')
    : fail.notFound('That isn’t available in the demo.');
}
