import { useEffect } from 'react';
import { env } from './env';

const SITE = 'Small Africa';
const DEFAULT_DESCRIPTION =
  'Small Africa is a fine-dining restaurant and lounge in Victoria Island, Lagos, serving Nigerian, Polish and Continental cuisine. Three kitchens. One table.';

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
  useEffect(() => {
    const fullTitle = title
      ? `${title} · ${SITE}`
      : `${SITE} · Nigerian, Polish & Continental Fine Dining in Lagos`;
    const desc = description ?? DEFAULT_DESCRIPTION;
    const url = `${env.siteUrl || window.location.origin}${window.location.pathname}`;
    document.title = fullTitle;
    setMeta('name', 'description', desc);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:url', url);
    if (image) setMeta('property', 'og:image', image);
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = url;
  }, [title, description, image]);
}
