/// <reference types="vite/client" />
import type { AzhApi } from '@shared/api'

declare global {
  interface Window {
    api: AzhApi
  }
}
