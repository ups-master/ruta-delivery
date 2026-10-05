import react from '@vitejs/plugin-react'
// `defineConfig` de 'vitest/config' reexporta el de Vite y ademas tipa el bloque
// `test`, sin necesitar una referencia triple-slash aparte.
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registro manual en main.tsx (virtual:pwa-register) para forzar recarga
      // automatica de la pagina cuando se detecta una version nueva desplegada.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Ruta - Gestión de entregas',
        short_name: 'Ruta',
        description: 'App de entregas: busqueda de factura, validacion de PIN y ubicacion GPS.',
        theme_color: '#146455',
        background_color: '#f5f7f5',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        // Assets de tesseract.js (worker/core wasm/traineddata) se sirven bajo demanda
        // al escanear una factura; no deben precachearse con el resto de la app.
        globIgnores: ['tesseract-assets/**'],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Vendors estables en su propio chunk: cambian mucho menos que el codigo de la
        // app, asi que el navegador los reutiliza de cache entre despliegues en vez de
        // volver a descargarlos. Leaflet aparte porque solo lo usan dos paginas admin
        // (ver App.tsx, ya con lazy() por ruta) y pesa ~150 kB por si solo.
        manualChunks(id) {
          if (id.includes('node_modules/leaflet')) return 'vendor-leaflet'
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/react/')
          ) {
            return 'vendor-react'
          }
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // El punto de entrada, los tipos y los propios tests no son logica a cubrir.
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts', 'src/types/**'],
      reporter: ['text', 'json-summary'],
      // Piso de cobertura: el CI falla si baja. Valores reales al fijarlo: 97 % instrucciones, 95 % ramas,
      // 95 % funciones y 99 % lineas; el piso deja margen para cambios pequeños sin test inmediato.
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
})
