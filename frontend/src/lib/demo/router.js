import { ApiError } from '@/lib/api';
import { fail } from './http';
import { can, currentUser, STAFF_ROLES } from '@/lib/demo/services/auth';

const routes = [];

/**
 * What a route handler receives. For 'user', 'staff' and permission routes `user` is always set.
 * @typedef {{ params: Record<string, string>, query: URLSearchParams, body: Record<string, any>,
 *   form: FormData | undefined, user: Record<string, any> | null, idempotencyKey: string | null }} Ctx
 */

/** Registers a route. Path parameters: `:id` is numeric, any other `:name` is one path segment. */
export function route(method, path, handler, guard = null) {
  const keys = [];
  const pattern = new RegExp(
    `^${path.replace(/:(\w+)/g, (_, key) => {
      keys.push(key);
      return key === 'id' ? '([0-9]+)' : '([^/]+)';
    })}$`,
  );
  routes.push({ method, pattern, keys, guard, handler });
}

/** Handles one API call against the demo database, like the PHP app would. */
export async function dispatch(path, options) {
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
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    return r.handler({
      params,
      query: new URLSearchParams(search),
      body: options.body ?? {},
      form: options.formData,
      user: user,
      idempotencyKey: options.idempotencyKey ?? null,
    });
  }
  throw pathMatched
    ? new ApiError(405, 'http_error', 'That isn’t allowed.')
    : fail.notFound('That isn’t available in the demo.');
}
