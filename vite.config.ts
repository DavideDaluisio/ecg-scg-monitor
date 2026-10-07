import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Real recordings in public/samples/local/ are for local development only.
// Vite copies all of public/ into dist/, so this plugin deletes them after every build.
function stripLocalSamples(): Plugin {
  return {
    name: 'strip-local-samples',
    apply: 'build',
    async closeBundle() {
      await rm(resolve(import.meta.dirname, 'dist/samples/local'), { recursive: true, force: true })
    },
  }
}

export default defineConfig({
  // GitHub Pages serves the app from https://<user>.github.io/ecg-scg-monitor/
  base: '/ecg-scg-monitor/',
  plugins: [react(), stripLocalSamples()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
})
