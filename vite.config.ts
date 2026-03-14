import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import type { IncomingMessage } from 'node:http'
import { execSync } from 'node:child_process'

const commitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'unknown' }
})()

const buildTime = new Date().toISOString()

function dynamicProxy(fallback: string): ProxyOptions & { router: (req: IncomingMessage) => string } {
  return {
    target: fallback,
    changeOrigin: true,
    secure: false,
    router: (req: IncomingMessage) =>
      (req.headers['x-odoo-target'] as string | undefined) || fallback,
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Odoo Activities GSD',
        short_name: 'GSD',
        description: 'Manage your planned activities in Odoo with a smooth UI',
        theme_color: '#050505',
        background_color: '#050505',
        display: 'standalone',
        icons: [
          {
            src: 'apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png'
          },
          {
            src: 'icon.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/jsonrpc': dynamicProxy('http://localhost'),
      '/xmlrpc': dynamicProxy('http://localhost'),
    }
  }
})
