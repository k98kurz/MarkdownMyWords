/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_DEV_MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  const React: typeof import('react').default;
}
