import { createClient } from '@supabase/supabase-js';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { randomUUID } from 'crypto';

export interface InternalNotificationItem {
  id: string;
  user_id: string;
  broadcast_id?: string | null;
  title: string;
  body: string;
  message?: string;
  is_read: boolean;
  read?: boolean;
  created_at: string;
  read_at?: string | null;
  data?: any;
}

export interface HistoryItem {
  id: string;
  title: string;
  body: string;
  target_count: number;
  read_count?: number;
  status: string;
  type: string;
  created_at: string;
}

// Ensure DOMException is available globally for fetch-blob and google auth requests
if (typeof (globalThis as any).DOMException === 'undefined') {
  (globalThis as any).DOMException = class DOMException extends Error {
    constructor(message?: string, name?: string) {
      super(message);
      this.name = name || 'DOMException';
    }
  };
}

const supabaseUrl = 
  process.env.SUPABASE_URL || 
  process.env.VITE_SUPABASE_URL || 
  '';

const isRevokedKey = (key?: string) => {
  if (!key) return true;
  const trimmed = key.trim();
  return (
    trimmed === '' || 
    trimmed === 'undefined' || 
    trimmed === 'null' ||
    trimmed === 'placeholder-key' ||
    trimmed.startsWith('sb_secret_') ||
    (!trimmed.startsWith('eyJ') && !trimmed.startsWith('sbp_') && !trimmed.startsWith('sb_publishable_'))
  );
};

const rawServiceRoleKey = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_SERVICE_KEY || 
  process.env.SUPABASE_SECRET_KEY || 
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || 
  '';

const supabaseServiceRoleKey = isRevokedKey(rawServiceRoleKey) ? '' : rawServiceRoleKey;

const supabaseAnonKey = 
  process.env.SUPABASE_ANON_KEY || 
  process.env.VITE_SUPABASE_ANON_KEY || 
  '';

// Supabase Anon Client
export const supabaseAnonClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);

// Supabase Admin Client (Service Role for RLS bypass in serverless functions)
export const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceRoleKey || supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);

if (!supabaseUrl) {
  console.error('[Notifications API] CRITICAL: Supabase URL is missing');
}
if (!supabaseServiceRoleKey) {
  console.warn('[Notifications API] SUPABASE_SERVICE_ROLE_KEY is missing. Operating with anon client (RLS bypass may be restricted).');
}

// Initialize Firebase Admin (Optional / Push Notifications)
let isFirebaseAdminInitialized = false;
if (getApps().length === 0) {
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
      let parsedServiceAccount: any;
      if (typeof serviceAccount === 'string') {
        const cleaned = serviceAccount.trim();
        if (!cleaned.startsWith('{') && cleaned.length > 20) {
          try {
            const decoded = Buffer.from(cleaned, 'base64').toString('utf-8');
            parsedServiceAccount = JSON.parse(decoded);
          } catch {
            parsedServiceAccount = JSON.parse(cleaned);
          }
        } else {
          parsedServiceAccount = JSON.parse(cleaned);
        }
      } else {
        parsedServiceAccount = serviceAccount;
      }

      // Fix private key formatting if it was escaped or has literal '\n'
      if (parsedServiceAccount && parsedServiceAccount.private_key) {
        parsedServiceAccount.private_key = parsedServiceAccount.private_key.replace(/\\n/g, '\n');
      }

      initializeApp({
        credential: cert(parsedServiceAccount)
      });
      isFirebaseAdminInitialized = true;
      console.log('[Notifications API] Firebase Admin initialized successfully');
    } else {
      console.warn('[Notifications API] FIREBASE_SERVICE_ACCOUNT is missing. Push fallback available via REST.');
    }
  } catch (e) {
    console.error('[Notifications API] Error initializing Firebase Admin:', e);
  }
} else {
  isFirebaseAdminInitialized = true;
}

/**
 * Resilient insertion into public.notifications with full backward compatibility:
 * Enforces user_id, broadcast_id, title, body, message (mirror of body), and is_read: false.
 * Performs graceful progressive fallback if optional table columns do not exist.
 */
async function insertNotificationsResilient(
  items: Array<{
    id?: string;
    user_id: string;
    broadcast_id?: string | null;
    title: string;
    body: string;
    message?: string;
    is_read: boolean;
    read?: boolean;
    created_at?: string;
    read_at?: string | null;
    data?: any;
  }>
) {
  if (!items.length) return;
  const CHUNK_SIZE = 100;

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    
    // Standard payload without non-existent columns like 'data'
    const stdRows = chunk.map(it => {
      const content = it.body || it.message || '';
      return {
        id: it.id || randomUUID(),
        user_id: it.user_id,
        broadcast_id: it.broadcast_id || null,
        title: it.title || 'Notificação',
        body: content,
        message: content,
        is_read: false,
        read: false,
        created_at: it.created_at || new Date().toISOString()
      };
    });

    const { error: stdErr } = await supabaseAdmin.from('notifications').insert(stdRows);
    if (!stdErr) continue;

    // If RLS policy blocked the insert (e.g. SUPABASE_SERVICE_ROLE_KEY is not configured in env)
    if (stdErr.message.includes('row-level security') || stdErr.message.includes('policy')) {
      console.warn('[Notifications API] In-app notification insert skipped due to Supabase RLS policy (SUPABASE_SERVICE_ROLE_KEY required for server-side multi-user inserts). Delivery proceeding.');
      continue;
    }

    console.warn('[Notifications API] Standard insert notice, retrying without broadcast_id:', stdErr.message);

    // Attempt 2: Without broadcast_id in case column is absent in custom legacy schema
    const noBroadcastRows = chunk.map(it => {
      const content = it.body || it.message || '';
      return {
        id: it.id || randomUUID(),
        user_id: it.user_id,
        title: it.title || 'Notificação',
        body: content,
        message: content,
        is_read: false,
        created_at: it.created_at || new Date().toISOString()
      };
    });

    const { error: noBroadcastErr } = await supabaseAdmin.from('notifications').insert(noBroadcastRows);
    if (!noBroadcastErr) continue;

    if (noBroadcastErr.message.includes('row-level security') || noBroadcastErr.message.includes('policy')) {
      console.warn('[Notifications API] In-app notification insert skipped due to Supabase RLS policy. Delivery proceeding.');
      continue;
    }

    // Attempt 3: Minimal schema fallback
    const minRows = chunk.map(it => {
      const content = it.body || it.message || '';
      return {
        user_id: it.user_id,
        title: it.title || 'Notificação',
        body: content,
        message: content,
        is_read: false
      };
    });

    const { error: minErr } = await supabaseAdmin.from('notifications').insert(minRows);
    if (minErr && !minErr.message.includes('row-level security')) {
      console.warn('[Notifications API] Notification insert notice:', minErr.message);
    }
  }
}

/**
 * Resilient insertion into public.notification_history using supabaseAdmin
 */
async function insertHistoryResilient(historyItem: HistoryItem) {
  try {
    const { error } = await supabaseAdmin
      .from('notification_history')
      .insert({
        id: historyItem.id,
        title: historyItem.title || 'Notificação',
        body: historyItem.body || '',
        target_count: historyItem.target_count || 0,
        read_count: historyItem.read_count || 0,
        status: historyItem.status || 'sent',
        type: historyItem.type || 'both',
        created_at: historyItem.created_at || new Date().toISOString()
      });

    if (error) {
      console.warn('[Notifications API] History insert retry without read_count/id:', error.message);
      await supabaseAdmin
        .from('notification_history')
        .insert({
          title: historyItem.title || 'Notificação',
          body: historyItem.body || '',
          target_count: historyItem.target_count || 0,
          status: historyItem.status || 'sent',
          type: historyItem.type || 'both'
        });
    }
  } catch (err) {
    console.warn('[Notifications API] Exception inserting notification_history:', err);
  }
}

/**
 * Verifies if the request is from an administrator
 */
async function checkAdmin(req: VercelRequest): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;
  
  const token = authHeader.split(' ')[1];
  if (!token) return false;

  try {
    // 1. Verify user token via supabaseAdmin
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      // Fallback: Check if JWT payload contains master admin email
      try {
        const payloadBase64 = token.split('.')[1];
        if (payloadBase64) {
          const decodedPayload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'));
          if (decodedPayload.email && decodedPayload.email.toLowerCase() === 'gabrielchendes@gmail.com') {
            return true;
          }
        }
      } catch {}
      return false;
    }

    // Direct check for master admin email
    if (user.email?.toLowerCase() === 'gabrielchendes@gmail.com') return true;

    // Check profiles and app_settings via supabaseAdmin (bypassing RLS)
    const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single();
    const { data: settings } = await supabaseAdmin.from('app_settings').select('admin_email').eq('id', 1).single();
    
    const isSuperAdmin = (settings?.admin_email && user.email?.toLowerCase() === settings.admin_email.toLowerCase()) || false;
    
    return !!profile?.is_admin || isSuperAdmin;
  } catch (ex) {
    console.error('[Notifications API] checkAdmin exception:', ex);
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const queryAction = req.query?.action as string;
  const urlParts = req.url?.split('/') || [];
  const urlAction = urlParts.pop()?.split('?')[0];
  const action = queryAction || urlAction;

  console.log(`[Notifications API] Request: ${req.method} ${req.url} | Action: ${action}`);

  // Sensitive actions requiring admin privileges
  const adminActions = ['notification-history', 'notification-clear', 'notification-details', 'push-status'];
  if (adminActions.includes(action)) {
    const isAdmin = await checkAdmin(req);
    if (!isAdmin) return res.status(403).json({ error: 'Access denied: Administrators only.' });
  }

  // Specialized check for notification-push: broadcast to multiple users requires admin
  if (action === 'notification-push') {
    const userIds = req.body?.userIds;
    if (userIds && Array.isArray(userIds) && userIds.length > 1) {
      const isAdmin = await checkAdmin(req);
      if (!isAdmin) return res.status(403).json({ error: 'Access denied: Broadcasts require administrator privileges.' });
    }
  }

  try {
    switch (action) {
      case 'notification-push':
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        return await handlePush(req, res);
      
      case 'test-push':
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        return await handleTestPush(req, res);

      case 'push-status':
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        return await handlePushStatus(req, res);

      case 'notify-admin':
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        return await handleNotifyAdmin(req, res);
      
      case 'notification-history':
        if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
        return await handleHistory(req, res);
      
      case 'notification-clear':
        if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
        return await handleClear(req, res);
        
      case 'notification-details':
        const id = (req.query?.id as string) || urlParts[urlParts.length - 1];
        return await handleDetails(req, res, id);

      case 'user-notifications':
        return await handleUserNotifications(req, res);

      case 'mark-read':
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        return await handleMarkRead(req, res);

      case 'mark-all-read':
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        return await handleMarkAllRead(req, res);

      case 'sub-topic':
        if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
        return await handleSubTopic(req, res);

      default:
        return res.status(404).json({ error: 'Action not found' });
    }
  } catch (error: any) {
    console.error(`[Notifications API] Error in ${action}:`, {
      message: (error as any).message,
      code: (error as any).code,
      details: (error as any).details,
      stack: (error as any).stack
    });
    return res.status(500).json({ 
      error: (error as any).message || 'Internal error on the notification server',
      details: (error as any).details || null
    });
  }
}

/**
 * Sends web push notifications via Firebase Admin or legacy FCM HTTP
 */
async function sendPushNotification(
  userIds: string[], 
  title: string, 
  body: string, 
  customData?: Record<string, any>, 
  client: any = supabaseAdmin
) {
  if (!userIds || !userIds.length) {
    return { success: false, reason: 'No user ID provided', count: 0, tokensFound: 0 };
  }

  try {
    // 1. Query push tokens using supabaseAdmin (bypassing RLS)
    const { data: tokens, error: tokenError } = await client
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', userIds);

    if (tokenError) {
      console.error('[Notifications API] Supabase error fetching tokens:', tokenError);
      return { success: false, reason: 'Error querying tokens in Supabase: ' + tokenError.message, count: 0, usersCount: 0, tokensFound: 0 };
    }
    
    if (!tokens || tokens.length === 0) {
      return { 
        success: false, 
        reason: 'Nenhum dos usuários selecionados possui notificações PUSH ativas no dispositivo.',
        count: 0,
        usersCount: 0,
        tokensFound: 0 
      };
    }

    const userIdsWithPush: string[] = Array.from(new Set(tokens.map((t: any) => t.user_id).filter(Boolean)));
    const registrationTokens: string[] = Array.from(new Set(tokens.map((t: any) => t.token).filter(Boolean))) as string[];
    
    if (registrationTokens.length === 0) {
      return { success: false, reason: 'Tokens inválidos ou vazios', count: 0, usersCount: 0, tokensFound: 0 };
    }

    const failedTokens: string[] = [];
    let totalSuccess = 0;
    let totalFailure = 0;

    // Transport Option A: Firebase Admin SDK (FCM v1 Multicast)
    if (getApps().length > 0) {
      const messaging = getMessaging();
      const BATCH_SIZE = 500;
      const notificationTag = customData?.broadcastId || customData?.id || customData?.tag || `push-${Date.now()}`;
      const targetUrl = customData?.url || customData?.link || '/';

      for (let i = 0; i < registrationTokens.length; i += BATCH_SIZE) {
        const batchTokens: string[] = registrationTokens.slice(i, i + BATCH_SIZE);
        
        const sanitizedData: Record<string, string> = {
          title: String(title || ''),
          body: String(body || ''),
          url: String(targetUrl || '/'),
          tag: String(notificationTag || '')
        };
        if (customData && typeof customData === 'object') {
          for (const [k, v] of Object.entries(customData)) {
            if (v !== undefined && v !== null) {
              sanitizedData[k] = typeof v === 'string' ? v : (typeof v === 'object' ? JSON.stringify(v) : String(v));
            }
          }
        }

        const message: any = {
          notification: { title, body },
          data: sanitizedData,
          webpush: {
            fcmOptions: {
              link: targetUrl
            },
            notification: {
              title,
              body,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag: notificationTag,
              renotify: false
            }
          },
          tokens: batchTokens,
        };

        const response = await messaging.sendEachForMulticast(message);
        totalSuccess += response.successCount;
        totalFailure += response.failureCount;

        if (response.failureCount > 0) {
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const errCode = resp.error?.code;
              if (
                errCode === 'messaging/invalid-registration-token' ||
                errCode === 'messaging/registration-token-not-registered' ||
                errCode === 'messaging/mismatched-credential'
              ) {
                failedTokens.push(batchTokens[idx]);
              }
            }
          });
        }
      }
    } 
    // Transport Option B: Legacy Firebase Server Key REST Endpoint
    else if (process.env.FIREBASE_SERVER_KEY) {
      try {
        const BATCH_SIZE = 500;
        const targetUrl = customData?.url || customData?.link || '/';
        for (let i = 0; i < registrationTokens.length; i += BATCH_SIZE) {
          const batchTokens: string[] = registrationTokens.slice(i, i + BATCH_SIZE);
          const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `key=${process.env.FIREBASE_SERVER_KEY}`
            },
            body: JSON.stringify({
              registration_ids: batchTokens,
              notification: {
                title,
                body,
                icon: '/icon-192.png',
                click_action: targetUrl
              },
              data: {
                title,
                body,
                url: targetUrl,
                ...(customData || {})
              }
            })
          });

          if (fcmResponse.ok) {
            const fcmData = await fcmResponse.json();
            totalSuccess += fcmData.success || 0;
            totalFailure += fcmData.failure || 0;
            if (Array.isArray(fcmData.results)) {
              fcmData.results.forEach((resItem: any, idx: number) => {
                if (resItem.error === 'NotRegistered' || resItem.error === 'InvalidRegistration') {
                  failedTokens.push(batchTokens[idx]);
                }
              });
            }
          } else {
            console.error('[Notifications API] FCM Legacy HTTP error:', fcmResponse.status, await fcmResponse.text());
            totalFailure += batchTokens.length;
          }
        }
      } catch (fcmErr: any) {
        console.error('[Notifications API] FCM Server Key request error:', fcmErr);
        return { success: false, reason: 'Error calling FCM: ' + fcmErr.message, count: 0, tokensFound: registrationTokens.length };
      }
    } else {
      return { 
        success: false, 
        reason: 'Firebase credentials not configured on the server (add FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVER_KEY to environment variables).',
        tokensFound: registrationTokens.length,
        count: 0
      };
    }
    
    // Clean up stale tokens asynchronously via supabaseAdmin
    if (failedTokens.length > 0) {
      client
        .from('push_tokens')
        .delete()
        .in('token', failedTokens)
        .then(({ error: delErr }: any) => {
          if (delErr) console.warn('[Notifications API] Error cleaning failed tokens:', delErr);
        });
    }

    return { 
      success: totalSuccess > 0 || (totalFailure === 0 && registrationTokens.length > 0), 
      count: userIdsWithPush.length, 
      usersCount: userIdsWithPush.length,
      deviceTokensCount: totalSuccess,
      failed: totalFailure, 
      tokensFound: registrationTokens.length 
    };
  } catch (e: any) {
    console.error('[Notifications API] Error sending push notification:', e);
    return { success: false, error: e?.message || e, reason: 'Exceção ao disparar Push: ' + (e?.message || e), count: 0, usersCount: 0, tokensFound: 0 };
  }
}

async function handleTestPush(req: VercelRequest, res: VercelResponse) {
  const { title = 'Push Notification Test 🚀', body = 'Seu dispositivo está configurado e recebendo notificações com sucesso!' } = req.body;
  
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Não autenticado' });
  
  const token = authHeader.split(' ')[1];
  const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !user) return res.status(401).json({ error: 'Sessão inválida' });

  const pushResult = await sendPushNotification([user.id], title, body, { test: 'true' }, supabaseAdmin);
  return res.status(200).json({ success: true, pushResult });
}

async function handlePushStatus(req: VercelRequest, res: VercelResponse) {
  const hasServiceAccount = !!process.env.FIREBASE_SERVICE_ACCOUNT;
  const hasServerKey = !!process.env.FIREBASE_SERVER_KEY;
  const isAdminInitialized = getApps().length > 0;

  const { count: tokenCount, error } = await supabaseAdmin
    .from('push_tokens')
    .select('*', { count: 'exact', head: true });

  return res.status(200).json({
    firebaseAdminInitialized: isAdminInitialized,
    hasServiceAccount,
    hasServerKey,
    readyToSendPush: isAdminInitialized || hasServerKey,
    registeredDevicesCount: tokenCount || 0,
    error: error?.message || null
  });
}

/**
 * Handles pushing notifications (broadcast or targeted)
 * Persists 100% to Supabase (notification_history and notifications) via supabaseAdmin.
 */
async function handlePush(req: VercelRequest, res: VercelResponse) {
  const { title, body, userIds, userId, type, sendInApp, skipPush = false, data } = req.body || {};
  
  let targetUserIds: string[] = [];
  if (Array.isArray(userIds) && userIds.length > 0) {
    targetUserIds = userIds.filter(Boolean);
  } else if (typeof userId === 'string' && userId.trim()) {
    targetUserIds = [userId.trim()];
  } else if (Array.isArray(req.body?.targetUserIds) && req.body.targetUserIds.length > 0) {
    targetUserIds = req.body.targetUserIds.filter(Boolean);
  }

  if (targetUserIds.length === 0) {
    return res.status(400).json({ error: 'Nenhum usuário especificado para envio.' });
  }

  // Determine actual notification type
  let resolvedType = type || (sendInApp === false ? 'push' : (sendInApp === true ? 'both' : 'both'));
  if (skipPush) resolvedType = 'in_app';

  const nowIso = new Date().toISOString();
  const broadcastId = randomUUID();
  const finalTitle = title || 'Notificação';
  const finalBody = body || '';

  // 1. Create broadcast history record in Supabase public.notification_history
  const historyItem: HistoryItem = {
    id: broadcastId,
    title: finalTitle,
    body: finalBody,
    target_count: targetUserIds.length,
    read_count: 0,
    status: 'sent',
    type: resolvedType,
    created_at: nowIso
  };

  await insertHistoryResilient(historyItem);

  // 2. Create in-app notifications for each user in Supabase public.notifications (if not push-only)
  if (resolvedType !== 'push') {
    const internalItems = targetUserIds.map(uid => ({
      id: randomUUID(),
      user_id: uid,
      broadcast_id: broadcastId,
      title: finalTitle,
      body: finalBody,
      message: finalBody, // Retain duplicate 'message' column for backward compatibility
      is_read: false,
      read: false,
      created_at: nowIso,
      read_at: null,
      data: data || {}
    }));

    await insertNotificationsResilient(internalItems);
  }
    
  // 3. Send background push if not skipped and not only in_app
  let pushResult: any = { skipped: true };
  if (!skipPush && resolvedType !== 'in_app') {
    const customData = {
      ...(data || {}),
      broadcastId,
      url: data?.url || '/'
    };
    pushResult = await sendPushNotification(targetUserIds, finalTitle, finalBody, customData, supabaseAdmin);
  }

  return res.status(200).json({ 
    success: true, 
    count: targetUserIds.length, 
    broadcastId,
    historyItem,
    pushResult 
  });
}

/**
 * Handles notifying administrators for system alerts (e.g. new comments, questions, purchases)
 */
async function handleNotifyAdmin(req: VercelRequest, res: VercelResponse) {
  const { title, body, data } = req.body || {};
  
  console.log('🔔 [Notifications API] handleNotifyAdmin recebido:', { title, body, data });

  // 1. Identify all admins via supabaseAdmin
  let adminIds: string[] = [];
  let adminEmails: string[] = [];

  try {
    let profiles: any[] | null = null;
    const { data: pData, error: pErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email, is_admin');
    
    if (!pErr && pData) {
      profiles = pData;
    } else {
      const { data: fallbackProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id, email');
      profiles = fallbackProfiles || [];
    }

    if (profiles && profiles.length > 0) {
      profiles.forEach(p => {
        if (p.is_admin === true || (p as any).role === 'admin' || (p as any).is_master_admin === true) {
          if (p.id) adminIds.push(p.id);
          if (p.email) adminEmails.push(p.email);
        }
      });
    }

    // Secondary: Master admin from settings
    const { data: settings } = await supabaseAdmin
      .from('app_settings')
      .select('admin_email')
      .limit(1)
      .maybeSingle();
    
    const masterEmails = ['gabrielchendes@gmail.com'];
    if (settings?.admin_email) {
      masterEmails.push(settings.admin_email.toLowerCase());
    }

    if (profiles && profiles.length > 0) {
      profiles.forEach(p => {
        if (p.email && masterEmails.includes(p.email.toLowerCase())) {
          if (!adminIds.includes(p.id)) adminIds.push(p.id);
          if (!adminEmails.includes(p.email)) adminEmails.push(p.email);
        }
      });
    }

    // Tertiary: Check auth.users if admin profiles were empty
    if (adminIds.length === 0) {
      try {
        const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
        if (authData?.users) {
          authData.users.forEach((u: any) => {
            if (u?.email && masterEmails.includes(u.email.toLowerCase())) {
              adminIds.push(u.id);
              adminEmails.push(u.email);
            }
          });
        }
      } catch (authErr) {
        console.warn('[Notifications API] listUsers fallback warning:', authErr);
      }
    }
  } catch (err) {
    console.error('[Notifications API] Exception identifying admins:', err);
  }

  // Deduplicate
  adminIds = [...new Set(adminIds.filter(id => !!id))];
  adminEmails = [...new Set(adminEmails.map(e => e.toLowerCase()))];

  console.log('👥 [Notifications API] Admins identificados para alerta:', { count: adminIds.length, emails: adminEmails });

  if (adminIds.length === 0) {
    return res.status(200).json({ success: true, message: 'Nenhum administrador encontrado para notificar.' });
  }

  if (adminIds.length > 20) adminIds = adminIds.slice(0, 20);

  const finalTitle = title || 'Nova Notificação Administrativa';
  const finalBody = body || 'Há uma nova atividade no aplicativo que requer sua atenção.';
  const nowIso = new Date().toISOString();
  const broadcastId = randomUUID();

  // 1. Log in Supabase notification_history using supabaseAdmin
  const adminHistoryItem: HistoryItem = {
    id: broadcastId,
    title: finalTitle,
    body: finalBody,
    target_count: adminIds.length,
    read_count: 0,
    status: 'sent',
    type: 'both',
    created_at: nowIso
  };

  await insertHistoryResilient(adminHistoryItem);

  // 2. Create in-app notifications for each admin in Supabase public.notifications
  const adminNotifs = adminIds.map(uid => ({
    id: randomUUID(),
    user_id: uid,
    broadcast_id: broadcastId,
    title: finalTitle,
    body: finalBody,
    message: finalBody,
    is_read: false,
    read: false,
    created_at: nowIso,
    read_at: null,
    data: data || {}
  }));

  await insertNotificationsResilient(adminNotifs);

  // 3. Send Push Notification to admins with direct routing URL
  const pushPayloadData = {
    ...(data || {}),
    broadcastId,
    url: data?.url || '/',
    tag: `admin-alert-${Date.now()}`
  };

  let pushResult: any = null;
  try {
    pushResult = await sendPushNotification(
      adminIds, 
      finalTitle, 
      finalBody, 
      pushPayloadData,
      supabaseAdmin
    );
    console.log('🚀 [Notifications API] Resultado do envio Push para admins:', pushResult);
  } catch (err) {
    console.error('[Notifications API] Erro ao disparar push para admins:', err);
  }

  return res.status(200).json({ 
    success: true, 
    adminCount: adminIds.length, 
    broadcastId,
    notifyEmails: adminEmails,
    pushResult 
  });
}

/**
 * Handles fetching broadcast and notification history directly from Supabase.
 * Aggregates live read and target counts from public.notifications.
 */
async function handleHistory(req: VercelRequest, res: VercelResponse) {
  try {
    // 1. Fetch from notification_history table using supabaseAdmin
    let historyList: any[] = [];
    try {
      const { data: hist, error: histErr } = await supabaseAdmin
        .from('notification_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (!histErr && hist) {
        historyList = hist;
      } else if (histErr) {
        console.warn('[Notifications API] notification_history query warning:', histErr.message);
      }
    } catch (hErr) {
      console.warn('[Notifications API] notification_history query exception:', hErr);
    }

    // 2. Fetch notifications from public.notifications using supabaseAdmin for live read stats
    let allNotifications: any[] = [];
    try {
      const { data: notifs, error: notifErr } = await supabaseAdmin
        .from('notifications')
        .select('id, user_id, broadcast_id, title, body, message, is_read, read, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(5000);

      if (!notifErr && notifs) {
        allNotifications = notifs;
      } else if (notifErr) {
        console.warn('[Notifications API] notifications query warning:', notifErr.message);
      }
    } catch (nErr) {
      console.warn('[Notifications API] notifications query exception:', nErr);
    }

    // 3. Group notifications by broadcast_id and unlinked title+timestamp bucket
    const broadcastStats: Record<string, { target_count: number; read_count: number; title: string; body: string; created_at: string; ids: string[] }> = {};
    const unlinkedGroups: Record<string, { target_count: number; read_count: number; title: string; body: string; created_at: string; ids: string[] }> = {};

    allNotifications.forEach((n: any) => {
      const isRead = Boolean(n.is_read || n.read || n.read_at);
      const notifTitle = n.title || 'Notificação';
      const notifBody = n.body || n.message || '';
      const notifDate = n.created_at || new Date().toISOString();

      if (n.broadcast_id) {
        if (!broadcastStats[n.broadcast_id]) {
          broadcastStats[n.broadcast_id] = {
            target_count: 0,
            read_count: 0,
            title: notifTitle,
            body: notifBody,
            created_at: notifDate,
            ids: []
          };
        }
        broadcastStats[n.broadcast_id].target_count += 1;
        if (isRead) broadcastStats[n.broadcast_id].read_count += 1;
        broadcastStats[n.broadcast_id].ids.push(n.id);
      } else {
        // Group unlinked individual notifications in 30-minute buckets to aggregate statistics cleanly
        const timeBucket = Math.floor(new Date(notifDate).getTime() / (1000 * 60 * 30));
        const snippet = notifBody.trim().substring(0, 30);
        const groupKey = `${notifTitle}___${snippet}___${timeBucket}`;
        if (!unlinkedGroups[groupKey]) {
          unlinkedGroups[groupKey] = {
            target_count: 0,
            read_count: 0,
            title: notifTitle,
            body: notifBody,
            created_at: notifDate,
            ids: []
          };
        }
        unlinkedGroups[groupKey].target_count += 1;
        if (isRead) unlinkedGroups[groupKey].read_count += 1;
        unlinkedGroups[groupKey].ids.push(n.id);
      }
    });

    // 4. Merge historyList with live counts from Supabase
    const historyMap = new Map<string, any>();

    historyList.forEach((item: any) => {
      const stats = broadcastStats[item.id];
      const liveReadCount = stats ? stats.read_count : (item.read_count || 0);
      const liveTargetCount = stats ? Math.max(stats.target_count, item.target_count || 0) : (item.target_count || 0);

      historyMap.set(item.id, {
        ...item,
        target_count: liveTargetCount,
        read_count: liveReadCount
      });
    });

    // 5. Synthesize entries from broadcastStats that are in notifications but missing in history table
    Object.entries(broadcastStats).forEach(([bId, stats]) => {
      if (!historyMap.has(bId)) {
        historyMap.set(bId, {
          id: bId,
          title: stats.title,
          body: stats.body,
          target_count: stats.target_count,
          read_count: stats.read_count,
          status: 'sent',
          type: 'both',
          created_at: stats.created_at
        });
      }
    });

    // 6. Synthesize entries from unlinked groups
    Object.entries(unlinkedGroups).forEach(([key, group]) => {
      const alreadyCovered = Array.from(historyMap.values()).some((h: any) => 
        h.title === group.title && Math.abs(new Date(h.created_at || h.sent_at).getTime() - new Date(group.created_at).getTime()) < 1000 * 60 * 30
      );

      if (!alreadyCovered) {
        historyMap.set(`group_${key}`, {
          id: `group_${key}`,
          title: group.title,
          body: group.body,
          target_count: group.target_count,
          read_count: group.read_count,
          status: 'sent',
          type: 'in_app',
          created_at: group.created_at
        });
      }
    });

    const result = Array.from(historyMap.values()).sort(
      (a: any, b: any) => new Date(b.created_at || b.sent_at || 0).getTime() - new Date(a.created_at || a.sent_at || 0).getTime()
    );

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[Notifications API] Exception in handleHistory:', err);
    return res.status(500).json({ error: err?.message || 'Error fetching history' });
  }
}

async function handleClear(req: VercelRequest, res: VercelResponse) {
  try {
    // Delete all broadcast notifications and history directly from Supabase via supabaseAdmin
    try {
      await supabaseAdmin
        .from('notifications')
        .delete()
        .not('broadcast_id', 'is', null);
    } catch (e1) {
      console.warn('[Notifications API] Error clearing broadcast notifications:', e1);
    }

    try {
      await supabaseAdmin
        .from('notification_history')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
    } catch (e2) {
      console.warn('[Notifications API] Error clearing notification_history table:', e2);
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error clearing history' });
  }
}

/**
 * Handles fetching in-app notifications for a specific user.
 * Directly queries public.notifications in Supabase with RLS bypass via supabaseAdmin,
 * returning the list ordered by created_at DESC (limit 50) and unreadCount.
 */
async function handleUserNotifications(req: VercelRequest, res: VercelResponse) {
  const targetUserId = (req.query?.userId as string) || (req.body?.userId as string);
  
  if (!targetUserId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[Notifications API] Supabase user-notifications query error:', error.message);
      return res.status(500).json({ 
        error: error.message, 
        notifications: [], 
        unreadCount: 0 
      });
    }

    const notifications = (data || []).map((row: any) => {
      const isRead = Boolean(row.is_read || row.read || row.read_at);
      const bodyContent = row.body || row.message || '';
      return {
        ...row,
        body: bodyContent,
        message: bodyContent,
        is_read: isRead,
        read: isRead
      };
    });

    const unreadCount = notifications.filter(n => !n.is_read && !n.read).length;

    return res.status(200).json({
      success: true,
      notifications,
      unreadCount
    });
  } catch (err: any) {
    console.error('[Notifications API] Exception in handleUserNotifications:', err);
    return res.status(500).json({ 
      error: err?.message || 'Error fetching notifications', 
      notifications: [], 
      unreadCount: 0 
    });
  }
}

/**
 * Marks a single notification as read in Supabase public.notifications
 */
async function handleMarkRead(req: VercelRequest, res: VercelResponse) {
  const { id, userId } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing notification id' });

  const now = new Date().toISOString();

  try {
    let query = supabaseAdmin
      .from('notifications')
      .update({ is_read: true, read: true, read_at: now })
      .eq('id', id);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { error } = await query;
    if (error) {
      console.warn('[Notifications API] Fallback update with minimal payload:', error.message);
      await supabaseAdmin
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
    }

    return res.status(200).json({ success: true, id });
  } catch (err: any) {
    console.error('[Notifications API] Error marking notification as read:', err);
    return res.status(500).json({ error: err?.message || 'Error updating notification' });
  }
}

/**
 * Marks all notifications for a given user as read in Supabase public.notifications
 */
async function handleMarkAllRead(req: VercelRequest, res: VercelResponse) {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const now = new Date().toISOString();

  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true, read: true, read_at: now })
      .eq('user_id', userId);

    if (error) {
      console.warn('[Notifications API] Fallback mark all read with minimal payload:', error.message);
      await supabaseAdmin
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId);
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[Notifications API] Error marking all notifications as read:', err);
    return res.status(500).json({ error: err?.message || 'Error updating notifications' });
  }
}

async function handleSubTopic(req: VercelRequest, res: VercelResponse) {
  const { userId, token, topic = 'all' } = req.body;
  if (!token) return res.status(400).json({ error: 'Missing token parameter' });
  
  if (userId) {
    try {
      await supabaseAdmin.from('push_tokens').upsert({
        user_id: userId,
        token: token,
        platform: 'web'
      }, { onConflict: 'token' });
    } catch (e) {
      console.warn('[Notifications API] Error saving token:', e);
    }
  }

  if (getApps().length > 0) {
    try {
      const messaging = getMessaging();
      await messaging.subscribeToTopic([token], topic);
      console.log(`[Notifications API] Subscribed token to topic ${topic}`);
    } catch (e: any) {
      console.warn('[Notifications API] Topic subscription warning:', e?.message);
    }
  }

  return res.status(200).json({ success: true, topic });
}

async function handleDetails(req: VercelRequest, res: VercelResponse, id: string) {
  if (!id) return res.status(400).json({ error: 'Missing broadcast id parameter' });
  
  try {
    let notificationsData: any[] = [];
    
    // 1. Lookup by broadcast_id via supabaseAdmin
    const { data: bData, error: bErr } = await supabaseAdmin
      .from('notifications')
      .select('id, user_id, is_read, read, read_at, created_at, title, body, message')
      .eq('broadcast_id', id)
      .order('created_at', { ascending: false });

    if (!bErr && bData && bData.length > 0) {
      notificationsData = bData;
    }

    // 2. Lookup by synthetic group key `group_Title___timeBucket`
    if (notificationsData.length === 0 && id.startsWith('group_')) {
      const raw = id.replace('group_', '');
      const parts = raw.split('___');
      const title = parts[0];
      
      const { data: gData } = await supabaseAdmin
        .from('notifications')
        .select('id, user_id, is_read, read, read_at, created_at, title, body, message')
        .eq('title', title)
        .order('created_at', { ascending: false });

      if (gData && gData.length > 0) {
        notificationsData = gData;
      }
    }

    // 3. Lookup via notification_history title matching
    if (notificationsData.length === 0) {
      try {
        const { data: histRecord } = await supabaseAdmin
          .from('notification_history')
          .select('title, created_at')
          .eq('id', id)
          .single();

        if (histRecord?.title) {
          const { data: tData } = await supabaseAdmin
            .from('notifications')
            .select('id, user_id, is_read, read, read_at, created_at, title, body, message')
            .eq('title', histRecord.title)
            .order('created_at', { ascending: false });

          if (tData && tData.length > 0) {
            notificationsData = tData;
          }
        }
      } catch (hEx) {}
    }

    // 4. Lookup by single notification ID
    if (notificationsData.length === 0) {
      const { data: directData } = await supabaseAdmin
        .from('notifications')
        .select('id, user_id, is_read, read, read_at, created_at, title, body, message')
        .eq('id', id);

      if (directData && directData.length > 0) {
        notificationsData = directData;
      }
    }

    if (notificationsData.length === 0) {
      return res.status(200).json([]);
    }

    // 5. Fetch profiles for all unique user_ids via supabaseAdmin
    const userIds = [...new Set(notificationsData.map(n => n.user_id).filter(Boolean))];
    const profilesMap: Record<string, any> = {};

    if (userIds.length > 0) {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
        const chunk = userIds.slice(i, i + CHUNK_SIZE);
        try {
          const { data: profiles } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, email, avatar_url')
            .in('id', chunk);

          if (profiles) {
            profiles.forEach(p => {
              profilesMap[p.id] = p;
            });
          }
        } catch (pEx) {
          console.warn('[Notifications API] Warning fetching profiles for details:', pEx);
        }
      }
    }

    // 6. Merge profiles and format response
    const formatted = notificationsData.map((row: any) => {
      const isRead = Boolean(row.is_read || row.read || row.read_at);
      const profile = profilesMap[row.user_id];
      
      return {
        id: row.id,
        user_id: row.user_id,
        is_read: isRead,
        read_at: row.read_at || (isRead ? row.created_at : null),
        created_at: row.created_at,
        profiles: profile || { 
          id: row.user_id, 
          full_name: 'Usuário', 
          email: 'N/A', 
          avatar_url: null 
        }
      };
    });

    formatted.sort((a, b) => {
      if (a.is_read && !b.is_read) return -1;
      if (!a.is_read && b.is_read) return 1;
      return (a.profiles?.full_name || '').localeCompare(b.profiles?.full_name || '');
    });

    return res.status(200).json(formatted);
  } catch (err: any) {
    console.error('[Notifications API] Exception in handleDetails:', err);
    return res.status(200).json([]);
  }
}
