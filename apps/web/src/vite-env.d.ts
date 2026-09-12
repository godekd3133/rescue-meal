/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_DEPLOYMENT_MODE?: "demo" | "production" | string;
  readonly VITE_WEB_PUSH_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
