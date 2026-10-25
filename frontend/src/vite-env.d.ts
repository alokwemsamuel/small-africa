/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_DEMO_MODE?: string;
  readonly VITE_SITE_URL?: string;
  readonly VITE_PAYSTACK_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
