export const env = {
  apiBase: import.meta.env.VITE_API_BASE ?? '/api',
  demoMode: import.meta.env.VITE_DEMO_MODE === 'true',
  siteUrl: import.meta.env.VITE_SITE_URL ?? '',
  paystackPublicKey: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY ?? '',
} as const;
