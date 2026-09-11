import { supabase } from './supabase';
import { showToast } from './customToast';
import { safeFetch } from './utils';

// Firebase configuration with robust defaults matching project
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDjl30PtezVKv0eJvEnNJopGCHGGQGLiAg",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "app-maternidade.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "app-maternidade",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "app-maternidade.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "669118811483",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:669118811483:web:0402740c397b1c7cb55e7e"
};

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || "BGNNXxZmddn3ZCpHjQKCGBy4rGlsyC-e2CNhYb-j5pfeXXHhmrTEGLk3L6r-7PMNNHVdYwNhyJBpzMvRg7LjTfQ";

let firebaseAppInstance: any = null;
let messagingInstance: any = null;
let isForegroundListenerAttached = false;

// Mask helper to avoid logging sensitive token data
function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 10) return '********';
  return `********${token.slice(-6)}`;
}

async function getFirebaseApp() {
  if (firebaseAppInstance) return firebaseAppInstance;
  if (!firebaseConfig.apiKey) {
    console.warn('[Push] Missing Firebase apiKey');
    return null;
  }
  const { initializeApp, getApps } = await import('firebase/app');
  const apps = getApps();
  if (apps.length > 0) {
    firebaseAppInstance = apps[0];
  } else {
    firebaseAppInstance = initializeApp(firebaseConfig);
  }
  return firebaseAppInstance;
}

// Helper to check messaging support lazily without pulling Firebase into initial bundle
export async function getMessagingInstance() {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return null;
  }

  if (messagingInstance) return messagingInstance;

  try {
    console.log('[Push] Initializing Firebase Messaging lazily...');
    const { getMessaging, isSupported } = await import('firebase/messaging');
    const supported = await isSupported();
    if (!supported) {
      console.log('[Push] Firebase Messaging is not supported in this browser or private mode.');
      return null;
    }
    const app = await getFirebaseApp();
    if (!app) return null;
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch (error) {
    console.error('[Push] Failed to initialize messaging:', error);
    return null;
  }
}

/**
 * Requests permission for push notifications and handles token generation and storage.
 */
export async function requestNotificationPermission(userId: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.warn('[Push] Notifications not supported in this environment');
    return false;
  }

  try {
    let permission = Notification.permission;
    console.log(`[Push] Current notification permission: ${permission}`);
    
    // If permission is not already granted or denied, request it
    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
      } catch {
        permission = await new Promise((resolve) => {
          Notification.requestPermission((p) => resolve(p));
        });
      }
      console.log(`[Push] User decided notification permission: ${permission}`);
    }

    if (permission === 'granted') {
      const messaging = await getMessagingInstance();
      if (messaging) {
        const result = await setupPushInBackground(userId, messaging);
        return result.success;
      }
      return true;
    }
  } catch (error) {
    console.error('[Push] Error requesting permission:', error);
  }
  return false;
}

/**
 * Ensures Service Worker is ready, fetches FCM token, and saves it.
 */
export async function setupPushInBackground(
  userId: string, 
  messaging: any
): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    let registration: ServiceWorkerRegistration | undefined;

    if ('serviceWorker' in navigator) {
      try {
        // First check existing registration
        registration = await navigator.serviceWorker.getRegistration();
        
        // If not ready, wait for ready state
        if (!registration) {
          registration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 3000))
          ]);
        }

        // Fallback: If no service worker is registered, attempt registering
        if (!registration) {
          try {
            registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            await navigator.serviceWorker.ready;
          } catch {
            // Standalone dev or fallback SW registration
            registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
            await navigator.serviceWorker.ready;
          }
        }
      } catch (swError: any) {
        console.warn('[Push] Service Worker registration check warning:', swError);
      }
    }

    if (!registration) {
      console.warn('[Push] No active Service Worker registration found for push.');
      return { success: false, error: 'Service Worker não disponível neste navegador.' };
    }

    console.log('[Push] Service Worker registered & ready for messaging');

    // Retrieve FCM token
    try {
      const { getToken } = await import('firebase/messaging');
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration
      });

      if (token) {
        console.log(`[Push] FCM token obtained: ${maskToken(token)}`);

        // 1. Subscribe to topic & notify backend API
        const { data: { session } } = await supabase.auth.getSession();
        safeFetch('/api/v1/notifications?action=sub-topic', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
          },
          body: JSON.stringify({ userId, token, topic: 'all' })
        }).catch(e => console.warn('[Push] Sub-topic notification notice:', e));

        // 2. Save token to Supabase push_tokens table
        try {
          const { error: upsertErr } = await supabase.from('push_tokens').upsert({
            user_id: userId,
            token: token,
            platform: 'web',
            updated_at: new Date().toISOString()
          }, { onConflict: 'token' });

          if (!upsertErr) {
            console.log('[Push] FCM token saved to Supabase');
          } else {
            console.warn('[Push] Supabase push_token upsert warning:', upsertErr.message);
          }
        } catch (dbErr) {
          console.warn('[Push] Push token db error:', dbErr);
        }

        // 3. Attach foreground listener
        registerForegroundListener(messaging);

        return { success: true, token };
      } else {
        return { success: false, error: 'Token FCM não foi gerado pelo navegador.' };
      }
    } catch (tokenError: any) {
      console.warn('[Push] Push subscription token error:', tokenError);
      return { success: false, error: tokenError?.message || 'Erro ao obter token FCM' };
    }
  } catch (error: any) {
    console.error('[Push] Unexpected background push setup error:', error);
    return { success: false, error: error?.message || 'Erro inesperado' };
  }
}

/**
 * Checks current push notification permission and registered status
 */
export async function getPushStatus(userId?: string) {
  const isSupportedBrowser = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
  const permission = typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported';
  
  let hasTokenInDb = false;
  let totalRegisteredDevices = 0;

  if (userId) {
    try {
      const { data } = await supabase
        .from('push_tokens')
        .select('id')
        .eq('user_id', userId);
      hasTokenInDb = !!(data && data.length > 0);
    } catch {}
  }

  try {
    const { count } = await supabase
      .from('push_tokens')
      .select('*', { count: 'exact', head: true });
    totalRegisteredDevices = count || 0;
  } catch {}

  return {
    isSupportedBrowser,
    permission,
    hasTokenInDb,
    totalRegisteredDevices
  };
}

/**
 * Listens for foreground messages and displays toast
 */
export async function onForegroundMessage() {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  if (isForegroundListenerAttached) return;

  const messaging = await getMessagingInstance();
  if (!messaging) return;

  registerForegroundListener(messaging);
}

function registerForegroundListener(messaging: any) {
  if (isForegroundListenerAttached || !messaging) return;
  isForegroundListenerAttached = true;

  import('firebase/messaging').then(({ onMessage }) => {
    onMessage(messaging, (payload) => {
      console.log('[Push] Message received in foreground:', {
        title: payload.notification?.title || payload.data?.title,
        body: payload.notification?.body || payload.data?.body
      });

      const title = payload.notification?.title || payload.data?.title || 'Nova Notificação';
      const body = payload.notification?.body || payload.data?.body;

      showToast.info(title, {
        description: body
      });
    });
    console.log('[Push] Foreground listener registered');
  }).catch(err => {
    isForegroundListenerAttached = false;
    console.warn('[Push] Foreground message listener failed to initialize:', err);
  });
}

/**
 * Automatically syncs the FCM token and enables foreground listening for returning users
 * who already granted permission.
 * Non-blocking, deferred to idle time to preserve Home performance.
 */
export function initPushIfGranted(userId: string) {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const runSync = async () => {
    try {
      console.log('[Push] Syncing push token and listeners in background for returning user...');
      const messaging = await getMessagingInstance();
      if (messaging) {
        await setupPushInBackground(userId, messaging);
      }
    } catch (e) {
      console.warn('[Push] Background push sync error:', e);
    }
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => runSync(), { timeout: 4000 });
  } else {
    setTimeout(runSync, 2000);
  }
}
