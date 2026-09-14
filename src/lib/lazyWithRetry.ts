import { ComponentType, lazy } from 'react';

// A resilient wrapper for lazy loading components that handles chunk load / dynamic import errors gracefully.
export function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>,
  retriesLeft = 3,
  interval = 600
) {
  return lazy(async () => {
    let currentTry = 0;
    while (true) {
      try {
        const mod = await componentImport();
        if (!mod || typeof mod.default === 'undefined') {
          throw new Error('Dynamic module import did not export a default React component');
        }
        return mod;
      } catch (error: any) {
        currentTry++;
        if (currentTry <= retriesLeft) {
          console.warn(`[lazyWithRetry] Retrying dynamic import (${currentTry}/${retriesLeft})...`, error);
          await new Promise((resolve) => setTimeout(resolve, interval * currentTry));
          continue;
        }

        const lowerMsg = (error?.message || '').toLowerCase();
        const errorName = error?.name || '';

        // Strictly match actual chunk/module network fetching failures across all browsers (Chrome, Safari, Firefox, iOS)
        const isChunkOrNetworkError = 
          lowerMsg.includes('failed to fetch dynamically imported module') ||
          lowerMsg.includes('error loading dynamically imported module') ||
          lowerMsg.includes('importing a module script failed') ||
          lowerMsg.includes('failed to load module script') ||
          lowerMsg.includes('dynamically imported module') ||
          lowerMsg.includes('networkerror') ||
          lowerMsg.includes('fetch resource') ||
          lowerMsg.includes('failed to fetch') ||
          lowerMsg.includes('loading chunk') ||
          errorName === 'ChunkLoadError';

        if (isChunkOrNetworkError && typeof window !== 'undefined') {
          const reloadKey = 'chunk-failed-reload-ts';
          const lastReload = sessionStorage.getItem(reloadKey);
          const now = Date.now();
          // Never reload more than once every 30 seconds to strictly prevent infinite reload loops
          if (!lastReload || now - parseInt(lastReload, 10) > 30000) {
            sessionStorage.setItem(reloadKey, now.toString());
            console.warn('⚠️ Dynamic import chunk or network error detected. Reloading page to fetch latest build...');
            window.location.reload();
            return new Promise<{ default: T }>(() => {}); // Keep pending while reload triggers
          }
        }

        throw error;
      }
    }
  });
}

