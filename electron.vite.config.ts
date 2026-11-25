import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: {
    // @octokit/rest — ESM-only, поэтому бандлим его в main
    plugins: [externalizeDepsPlugin({ exclude: ['@octokit/rest'] })],
    resolve: { alias }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias }
  },
  renderer: {
    plugins: [react()],
    resolve: { alias: { ...alias, '@': resolve(__dirname, 'src/renderer/src') } }
  }
})
