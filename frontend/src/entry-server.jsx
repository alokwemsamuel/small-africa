// Server render for the pre-built public pages (build time only, never shipped to browsers).
// scripts/prerender.mjs loads the bundled version of this file in Node and calls render() for
// each public page. See docs/DEPLOYMENT.md, "Pre-built pages".
import { dehydrate } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router-dom';
import { Writable } from 'node:stream';
import { AppProviders } from '@/app/App';
import { createQueryClient, routes } from '@/app/router';
import { setTransport } from '@/lib/api';
import { basename, env } from '@/lib/env';
import { SeoCollector, seoTags } from '@/lib/seo';

export const siteUrl = env.siteUrl.replace(/\/$/, '');
export { basename };

/** Reads public data from a running API (e.g. the live site) while pre-building. */
export function fromLiveApi(apiUrl) {
  setTransport(async (path) => {
    const res = await fetch(apiUrl.replace(/\/$/, '') + path, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  });
}

/** Reads public data from the demo database (the seeded menu and site details). */
export async function fromDemoData() {
  const [{ buildState }, { dispatch }, { default: snapshot }] = await Promise.all([
    import('@/lib/demo/build'),
    import('@/lib/demo/router'),
    import('@/lib/demo/snapshot.json'),
  ]);
  await import('@/lib/demo/routes/public');
  await buildState(snapshot);
  setTransport(async (path, options) => structuredClone(await dispatch(path, options)));
}

/** @returns {Promise<string[]>} every dish page to pre-build, e.g. 'smoky-party-jollof' */
export async function dishSlugs() {
  const { api } = await import('@/lib/api');
  const menu = await api('/menu');
  return menu.dishes.map((d) => d.slug);
}

function toHtml(element) {
  return new Promise((resolve, reject) => {
    let failed = null;
    const stream = renderToPipeableStream(element, {
      // Wait for lazy-loaded pages too, so the HTML is complete.
      onAllReady() {
        const chunks = [];
        const sink = new Writable({
          write(chunk, _enc, done) {
            chunks.push(chunk);
            done();
          },
        });
        sink.on('finish', () => (failed ? reject(failed) : resolve(Buffer.concat(chunks).toString('utf8'))));
        stream.pipe(sink);
      },
      onShellError: reject,
      onError(error) {
        failed = error;
      },
    });
  });
}

/**
 * Renders one public page.
 * @param {string} path e.g. '/menu' (without the base path)
 * @returns {Promise<{ html: string, head: ReturnType<typeof seoTags>, state: object }>}
 */
export async function render(path) {
  const client = createQueryClient();
  const handler = createStaticHandler(routes, { basename });
  const url = `http://prerender${basename === '/' ? '' : basename}${path}`;
  const page = async () => {
    const context = await handler.query(new Request(url));
    if (context instanceof Response) throw new Error(`${path} redirects`);
    const router = createStaticRouter(handler.dataRoutes, context);
    let seo = {};
    const html = await toHtml(
      <StrictMode>
        <SeoCollector.Provider value={(meta) => (seo = meta)}>
          <AppProviders client={client}>
            <StaticRouterProvider router={router} context={context} hydrate={false} />
          </AppProviders>
        </SeoCollector.Provider>
      </StrictMode>,
    );
    return { html, seo };
  };

  // First pass: find out which public data the page asks for; fetch it; render again with it.
  // Only 'public' queries are filled in, never anything about a signed-in visitor.
  await page();
  const wanted = client
    .getQueryCache()
    .getAll()
    .filter((q) => q.queryKey[0] === 'public' && q.options.queryFn);
  await Promise.all(
    wanted.map((q) => client.fetchQuery({ queryKey: q.queryKey, queryFn: q.options.queryFn })),
  );
  const { html, seo } = await page();

  return {
    html,
    head: seoTags(seo, `${siteUrl}${path === '/' ? '/' : path}`),
    state: dehydrate(client, {
      shouldDehydrateQuery: (q) => q.state.status === 'success' && q.queryKey[0] === 'public',
    }),
  };
}
