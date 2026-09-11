import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        devOptions: {
          enabled: false,
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          importScripts: ['/firebase-messaging-sw.js'],
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
          globIgnores: [
            '**/AdminPanel*.js',
            '**/CourseEditor*.js',
            '**/PackageEditor*.js',
            '**/AiCourse*.js',
            '**/vendor-player*.js',
            '**/vendor-charts*.js',
            '**/vendor-quill*.js',
            '**/vendor-firebase*.js',
            '**/browser-image-compression*.js'
          ],
          maximumFileSizeToCacheInBytes: 4000000,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'supabase-storage',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/.*\.r2\.dev\/.*/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'media-assets',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
                rangeRequests: true // Support for video streaming parts
              },
            },
            {
              urlPattern: /^https:\/\/images\.unsplash\.com\/.*/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'external-images',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 15, // 15 days
                }
              }
            }
          ]
        },
        manifest: {
          name: 'Premium App',
          short_name: 'Premium App',
          description: 'Plataforma exclusiva de cursos e conteúdos premium',
          theme_color: '#0f0f0f',
          background_color: '#0f0f0f',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
    build: {
      target: 'esnext',
      minify: 'esbuild',
      cssMinify: true,
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react-quill-new') || id.includes('quill')) {
                return 'vendor-quill';
              }
              if (id.includes('react-player') || id.includes('hls.js') || id.includes('dashjs')) {
                return 'vendor-player';
              }
              if (id.includes('recharts')) {
                return 'vendor-charts';
              }
              if (id.includes('firebase') || id.includes('@firebase')) {
                return 'vendor-firebase';
              }
              if (id.includes('motion')) {
                return 'vendor-motion';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-lucide';
              }
              if (id.includes('@supabase')) {
                return 'vendor-supabase';
              }
              if (
                id.includes('/node_modules/react/') ||
                id.includes('/node_modules/react-dom/') ||
                id.includes('/node_modules/scheduler/')
              ) {
                return 'vendor-react';
              }
            }
          }
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'react': path.resolve(__dirname, './node_modules/react'),
        'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'motion/react'],
    },
    server: {
      hmr: false,
      watch: null,
    },
  };
});
