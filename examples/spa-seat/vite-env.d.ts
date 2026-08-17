/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AV_HOST: string;
  readonly VITE_AV_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
