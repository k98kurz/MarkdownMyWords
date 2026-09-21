/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_DEV_MODE: string;
  readonly VITE_APP_STORAGE_DB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  const React: typeof import('react').default;
}
