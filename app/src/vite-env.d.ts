/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EXECUTOR_UNICHAIN_SEPOLIA?: string;
  readonly VITE_EXECUTOR_BASE_SEPOLIA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
