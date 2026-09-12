import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, Notification } from '../lib/supabase';
import { Bell, X, Check, Info } from 'lucide-react';
import { GlowingSpinner } from './GlowingSpinner';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { useI18n } from '../contexts/I18nContext';
import { safeFetch } from '../lib/utils';

interface NotificationBellProps {
  user: User;
}

/**
 * Formats timestamps strictly in US English standard (MMM d, yyyy, h:mm a)
 * while ensuring UTC timestamps are accurately converted to local time.
 */
function formatUSDateTime(val: string | Date | number | undefined | null): string {
  if (!val) return '';
  try {
    let date: Date;
    if (val instanceof Date) {
      date = val;
    } else if (typeof val === 'number') {
      date = new Date(val);
    } else {
      let str = String(val).trim();
      if (str.includes(' ') && !str.includes('T')) {
        str = str.replace(' ', 'T');
      }
      if (!str.endsWith('Z') && !str.includes('+') && !/-\d\d:\d\d$/.test(str)) {
        str = str + 'Z';
      }
      date = new Date(str);
    }
    if (isNaN(date.getTime())) {
      date = new Date(val);
    }
    if (isNaN(date.getTime())) return String(val);

    return format(date, 'MMM d, yyyy, h:mm a', { locale: enUS });
  } catch (e) {
    return String(val);
  }
}

export default function NotificationBell({ user }: NotificationBellProps) {
  const { t } = useI18n();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      // 1. Fetch from Supabase directly
      let sbNotifs: any[] = [];
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (!error && Array.isArray(data)) {
          sbNotifs = data;
        }
      } catch (sbErr) {
        console.warn('[NotificationBell] Supabase fetch notice:', sbErr);
      }

      // 2. Fetch from Central API endpoint
      let apiNotifs: any[] = [];
      try {
        const res = await safeFetch(`/api/v1/notifications?action=user-notifications&userId=${encodeURIComponent(user.id)}`);
        if (res && res.success && Array.isArray(res.notifications)) {
          apiNotifs = res.notifications;
        }
      } catch (apiErr) {
        console.warn('[NotificationBell] API fetch notice:', apiErr);
      }

      // 3. Merge & Deduplicate by ID
      const notifMap = new Map<string, any>();
      [...apiNotifs, ...sbNotifs].forEach(n => {
        if (!n || !n.id) return;
        const isRead = Boolean(n.is_read || n.read || n.read_at);
        const existing = notifMap.get(n.id);
        if (existing) {
          notifMap.set(n.id, {
            ...existing,
            ...n,
            is_read: existing.is_read || isRead,
            read: existing.read || isRead,
            body: n.body || n.message || existing.body || existing.message || '',
            message: n.body || n.message || existing.body || existing.message || ''
          });
        } else {
          notifMap.set(n.id, {
            ...n,
            is_read: isRead,
            read: isRead,
            body: n.body || n.message || '',
            message: n.body || n.message || ''
          });
        }
      });

      const mergedList = Array.from(notifMap.values()).sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );

      setNotifications(mergedList);
      setUnreadCount(mergedList.filter(n => !n.is_read && !n.read).length);
    } catch (error) {
      console.error('[NotificationBell] Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    fetchNotifications();

    // Periodic polling every 20s to ensure internal notifications appear reliably
    const pollInterval = setInterval(() => {
      fetchNotifications();
    }, 20000);

    // Real-time subscription
    const channelId = Math.random().toString(36).substring(2, 9);
    const channel = supabase
      .channel(`user_notifications_${channelId}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        () => fetchNotifications()
      )
      .subscribe();

    // Click outside to close
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [user.id, fetchNotifications]);

  // Refresh whenever user opens the dropdown
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  const markAsRead = async (id: string) => {
    const now = new Date().toISOString();
    // Optimistic UI update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));

    try {
      // 1. Update in Supabase
      supabase
        .from('notifications')
        .update({ is_read: true, read: true, read_at: now })
        .eq('id', id)
        .then(() => {})
        .catch(err => console.warn('[NotificationBell] Supabase markAsRead notice:', err));

      // 2. Update in centralized API
      safeFetch('/api/v1/notifications?action=mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, userId: user.id })
      }).catch(err => console.warn('[NotificationBell] Central API markAsRead notice:', err));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    const now = new Date().toISOString();
    // Optimistic UI update
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true, read: true })));
    setUnreadCount(0);

    try {
      // 1. Update in Supabase
      supabase
        .from('notifications')
        .update({ is_read: true, read: true, read_at: now })
        .eq('user_id', user.id)
        .or('is_read.eq.false,is_read.is.null')
        .then(() => {})
        .catch(err => console.warn('[NotificationBell] Supabase markAllAsRead notice:', err));

      // 2. Update in centralized API
      safeFetch('/api/v1/notifications?action=mark-all-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      }).catch(err => console.warn('[NotificationBell] Central API markAllAsRead notice:', err));
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-white transition-all active:scale-95"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell size={28} className={unreadCount > 0 ? "text-primary animate-pulse" : ""} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-primary text-white text-[12px] font-black px-1.5 rounded-full min-w-[22px] h-[22px] flex items-center justify-center border-2 border-zinc-900 shadow-lg animate-bounce">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for mobile */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] md:hidden"
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-x-4 top-20 md:absolute md:inset-auto md:right-0 md:top-full md:mt-2 w-auto md:w-96 bg-zinc-900 border border-white/10 rounded-3xl shadow-2xl overflow-hidden z-[1000] max-h-[80vh] flex flex-col"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div className="flex items-center gap-3">
                  <Bell size={24} className="text-primary" />
                  <h3 className="font-black text-lg uppercase tracking-tighter">
                    {t('notifications.title') || 'Notifications'}
                  </h3>
                </div>
                <div className="flex items-center gap-4">
                  {unreadCount > 0 && (
                    <button 
                      onClick={markAllAsRead}
                      className="text-[10px] text-primary hover:underline font-black uppercase tracking-widest whitespace-nowrap"
                    >
                      {t('notifications.clear_all') || 'Mark all as read'}
                    </button>
                  )}
                  <button 
                    onClick={() => setIsOpen(false)} 
                    className="text-gray-500 hover:text-white transition-colors p-1"
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 custom-scrollbar">
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <GlowingSpinner size="md" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-500 px-6 text-center">
                    <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4">
                      <Bell size={40} className="opacity-20" />
                    </div>
                    <p className="text-base font-medium">{t('notifications.empty') || "You're all caught up!"}</p>
                    <p className="text-sm opacity-60">{t('notifications.empty_desc') || 'No notifications right now.'}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {notifications.map((notification) => (
                      <div 
                        key={notification.id}
                        className={`p-6 transition-all hover:bg-white/5 relative group ${!notification.is_read ? 'bg-primary/10' : ''}`}
                      >
                        {!notification.is_read && (
                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary shadow-[0_0_10px_rgba(236,72,153,0.5)]" />
                        )}
                        <div className="flex justify-between items-start gap-4 mb-2">
                          <h4 className={`text-base font-black leading-tight ${!notification.is_read ? 'text-white' : 'text-gray-400'}`}>
                            {notification.title}
                          </h4>
                          {!notification.is_read && (
                            <button 
                              onClick={() => markAsRead(notification.id)}
                              className="group/btn flex items-center gap-2 pl-3 pr-4 py-2 bg-primary/10 text-primary rounded-full hover:bg-primary hover:text-white transition-all overflow-hidden shrink-0"
                              title={t('notifications.mark_as_read') || 'Mark as read'}
                            >
                              <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">
                                {t('notifications.mark_as_read') || 'Mark as read'}
                              </span>
                              <Check size={14} className="shrink-0" />
                            </button>
                          )}
                        </div>
                        <p className={`text-sm leading-relaxed mb-3 ${!notification.is_read ? 'text-gray-200' : 'text-gray-500'}`}>
                          {notification.body || (notification as any).message}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                          <Info size={12} className="shrink-0" />
                          <span>{formatUSDateTime(notification.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="p-4 bg-white/5 border-t border-white/5 text-center">
                <button 
                  onClick={() => setIsOpen(false)}
                  className="w-full py-3 text-xs text-gray-400 hover:text-white font-black uppercase tracking-[0.2em] transition-all"
                >
                  {t('notifications.close') || 'Close'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
