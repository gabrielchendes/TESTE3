import { supabase } from './supabase';
import { toast } from 'sonner';
import { showToast } from './customToast';
import { safeFetch } from './utils';

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "app-maternidade.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "app-maternidade",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "app-maternidade.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "669118811483",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:669118811483:web:0402740c397b1c7cb55e7e"
};

let firebaseAppInstance: any = null;
let messagingInstance: any = null;

async function getFirebaseApp() {
  if (firebaseAppInstance) return firebaseAppInstance;
  if (!firebaseConfig.apiKey) {
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

// Helper to check messaging support lazily without pulling Firebase into the initial bundle
async function getMessagingInstance() {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return null;
  }
  
  if (Notification.permission !== 'granted') {
    return null;
  }

  if (messagingInstance) return messagingInstance;

  try {
    const { getMessaging, isSupported } = await import('firebase/messaging');
    const supported = await isSupported();
    if (!supported) {
      console.log('⚠️ Firebase Messaging is not supported in this browser or private mode.');
      return null;
    }
    const app = await getFirebaseApp();
    if (!app) return null;
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch (error) {
    console.error('❌ Failed to initialize messaging:', error);
    return null;
  }
}

/**
 * Requests permission for push notifications and handles the background registration
 */
export async function requestNotificationPermission(userId: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;

  try {
    let permission = Notification.permission;
    
    // If permission is not already granted, request it
    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
      } catch (err) {
        permission = await new Promise((resolve) => {
          Notification.requestPermission((p) => resolve(p));
        });
      }
    }

    if (permission === 'granted') {
      // Do the registration in the background without blocking the UI
      const messaging = await getMessagingInstance();
      if (messaging) {
        setupPushInBackground(userId, messaging);
      }
      return true;
    }
  } catch (error) {
    console.error('❌ Error requesting permission:', error);
  }
  return false;
}

/**
 * Handles the heavy lifting of registration in the background
 */
export async function setupPushInBackground(userId: string, messaging: any): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    // Safely retrieve or register service worker for push notifications without conflicting with main PWA SW
    let registration: ServiceWorkerRegistration | undefined;
    try {
      if ('serviceWorker' in navigator) {
        const existingReg = await navigator.serviceWorker.getRegistration();
        if (existingReg) {
          registration = existingReg;
        } else {
          const swParams = new URLSearchParams();
          if (firebaseConfig.apiKey) swParams.set('apiKey', firebaseConfig.apiKey);
          if (firebaseConfig.authDomain) swParams.set('authDomain', firebaseConfig.authDomain);
          if (firebaseConfig.projectId) swParams.set('projectId', firebaseConfig.projectId);
          if (firebaseConfig.storageBucket) swParams.set('storageBucket', firebaseConfig.storageBucket);
          if (firebaseConfig.messagingSenderId) swParams.set('messagingSenderId', firebaseConfig.messagingSenderId);
          if (firebaseConfig.appId) swParams.set('appId', firebaseConfig.appId);
          const swUrl = swParams.toString() ? `/firebase-messaging-sw.js?${swParams.toString()}` : '/firebase-messaging-sw.js';

          registration = await navigator.serviceWorker.register(swUrl, { 
            scope: '/firebase-cloud-messaging-push-scope' 
          });
        }
        await navigator.serviceWorker.ready;
      }
    } catch (swError: any) {
      console.warn('⚠️ Service Worker registration error:', swError);
      return { success: false, error: 'Falha ao registrar Service Worker: ' + (swError?.message || swError) };
    }

    if (!registration) {
      console.warn('⚠️ No active service worker registration found for push.');
      return { success: false, error: 'Service Worker não disponível neste navegador.' };
    }

    // Get token dynamically
    try {
      const { getToken } = await import('firebase/messaging');
      const token = await getToken(messaging, {
        vapidKey: 'BGNNXxZmddn3ZCpHjQKCGBy4rGlsyC-e2CNhYb-j5pfeXXHhmrTEGLk3L6r-7PMNNHVdYwNhyJBpzMvRg7LjTfQ',
        serviceWorkerRegistration: registration
      });

      if (token) {
        // 1. Subscribe to topic & notify backend API
        const { data: { session } } = await supabase.auth.getSession();
        safeFetch('/api/v1/notifications?action=sub-topic', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {})
          },
          body: JSON.stringify({ userId, token, topic: 'all' })
        }).catch(e => console.warn('⚠️ Push sub-topic notification notice:', e));

        // 2. Save token to Supabase push_tokens table
        try {
          const { error: upsertErr } = await supabase.from('push_tokens').upsert({
            user_id: userId,
            token: token,
            platform: 'web'
          }, { onConflict: 'token' });

          if (!upsertErr) {
            console.log('✅ Push token saved to Supabase');
          } else {
            console.warn('⚠️ Supabase push_token upsert warning:', upsertErr.message);
          }
        } catch (dbErr) {
          console.warn('⚠️ Push token db error:', dbErr);
        }

        return { success: true, token };
      } else {
        return { success: false, error: 'Token FCM não foi gerado pelo navegador.' };
      }
    } catch (tokenError: any) {
      console.warn('⚠️ Push subscription token error:', tokenError);
      return { success: false, error: tokenError?.message || 'Erro ao obter token FCM' };
    }
  } catch (error: any) {
    console.error('❌ Unexpected background push setup error:', error);
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
    } catch (e) {}
  }

  try {
    const { count } = await supabase
      .from('push_tokens')
      .select('*', { count: 'exact', head: true });
    totalRegisteredDevices = count || 0;
  } catch (e) {}

  return {
    isSupportedBrowser,
    permission,
    hasTokenInDb,
    totalRegisteredDevices
  };
}

/**
 * Listens for foreground messages
 */
export async function onForegroundMessage() {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const messaging = await getMessagingInstance();
  if (!messaging) return;

  try {
    const { onMessage } = await import('firebase/messaging');
    onMessage(messaging, (payload) => {
      console.log('Message received in foreground:', payload);
      if (payload.notification) {
        showToast.info(payload.notification.title || 'Nova Notificação', {
          description: payload.notification.body
        });
      }
    });
  } catch (err) {
    console.warn('⚠️ Foreground message listener failed to initialize:', err);
  }
}
