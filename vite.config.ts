import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/pageturn/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['book-icon.svg'],
      manifest: {
        name: 'PageTurn — Your Reading Life',
        short_name: 'PageTurn',
        description: 'A feature-rich reading tracker with custom shelves, challenges, and stats',
        theme_color: '#c94114',
        background_color: '#fdfbf7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/pageturn/',
        scope: '/pageturn/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // Google Books/Open Library calls must always hit the network — never
      // serve a cached search result. Only the app shell is precached.
      workbox: {
        navigateFallbackDenylist: [/^\/pageturn\/api/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin.includes('supabase.co') ||
              url.origin.includes('googleapis.com') ||
              url.origin.includes('openlibrary.org'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
