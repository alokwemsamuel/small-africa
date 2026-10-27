import { createContext, useContext, useEffect } from 'react';
import { env } from './env';

const SITE = 'Small Africa';
const DEFAULT_DESCRIPTION =
  'Small Africa is a fine-dining restaurant and lounge in Victoria Island, Lagos, serving Nigerian, Polish and Continental cuisine. Three kitchens. One table.';

/**
 * When pages are pre-built, the server render passes a function here to collect each page's
 * title and description for the <head> of its HTML file. In the browser it is null.
 */
export const SeoCollector = createContext(null);

/**
 * The tags for a page.
 * @param {{ title?: string, description?: string, image?: string }} page
 * @param {string} url absolute address of the page
 */
export function seoTags({ title, description, image }, url) {
  return {
    title: title ? `${title} · ${SITE}` : `${SITE} · Nigerian, Polish & Continental Fine Dining in Lagos`,
    description: description ?? DEFAULT_DESCRIPTION,
    image: image ?? null,
    url,
  };
}

function setMeta(attr, key, value) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

/** Per-page title, description, Open Graph tags and canonical URL. */
export function useSeo({ title, description, image }) {
  // Server render only: record the tags for the pre-built HTML (effects don't run there).
  const collect = useContext(SeoCollector);
  if (collect) collect({ title, description, image });

  useEffect(() => {
    const tags = seoTags(
      { title, description, image },
      `${env.siteUrl || window.location.origin}${window.location.pathname}`,
    );
    document.title = tags.title;
    setMeta('name', 'description', tags.description);
    setMeta('property', 'og:title', tags.title);
    setMeta('property', 'og:description', tags.description);
    setMeta('property', 'og:url', tags.url);
    if (tags.image) setMeta('property', 'og:image', tags.image);
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = tags.url;
  }, [title, description, image]);
}
