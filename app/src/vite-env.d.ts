/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RELAY_URL: string
  readonly VITE_ROOM_ID_LENGTH: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
