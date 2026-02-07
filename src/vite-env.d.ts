/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_DEV_MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
