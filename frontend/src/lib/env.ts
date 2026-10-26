export const env = {
  apiBase: import.meta.env.VITE_API_BASE ?? '/api',
  demoMode: import.meta.env.VITE_DEMO_MODE === 'true',
  siteUrl: import.meta.env.VITE_SITE_URL ?? '',
  paystackPublicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ?? '',
} as const;

/** URL for a media path from the API ('/media/…'); the demo's uploaded photos are data URLs. */
export const mediaUrl = (path: string) => (/^(data:|https?:)/.test(path) ? path : `${env.apiBase}${path}`);
